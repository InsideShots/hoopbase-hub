/**
 * W20.H.4 — ONNX Runtime Web inference hook for Pro Studio.
 *
 * Loads YOLOv8n (WebGPU → WASM fallback), samples frames from one or more
 * HTMLVideoElements, and emits detection events suitable for basketball stat
 * extraction (shots, makes, assists).
 *
 * Model input:  [1, 3, 640, 640] float32 RGB, normalised 0–1
 * Model output: [1, 84, 8400] — 4 bbox + 80 COCO classes, or
 *               [1, 5, 8400]  — 4 bbox + 1 class (custom ball/player model)
 *
 * Basketball-relevant COCO class IDs (YOLOv8n stock):
 *   0  = person  (→ player)
 *   32 = sports ball (→ basketball)
 *
 * For best results use a fine-tuned YOLOv8n with classes:
 *   0 = player, 1 = ball, 2 = hoop, 3 = jersey_number
 *
 * WebGPU note:
 *   Stock YOLOv8n ONNX exports fail on WebGPU due to DFL Softmax(axis=1).
 *   Use scripts/export_webgpu_model.py to produce yolov8n_webgpu.onnx first.
 *
 * Usage:
 *   const { ready, ep, startStream, stopStream, onEvent } = useOnnxInference({
 *     modelUrl: '/models/yolov8n_webgpu.onnx',
 *     sampleFps: 5,
 *     confThreshold: 0.4,
 *     onDetections: (dets, videoEl, globalTMs) => { ... },
 *   });
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ORT CDN — WebGPU-capable build */
const ORT_CDN = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.js';
const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

const INPUT_SIZE = 640;

/** COCO class IDs we care about for basketball */
const BASKETBALL_CLASSES = {
  0:  'player',
  32: 'ball',
};

/** Basketball-specific detection thresholds */
const CLASS_CONF = {
  player: 0.35,
  ball:   0.45,
  hoop:   0.50,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}

/**
 * Draw a video frame into a 640×640 canvas, return Float32 NCHW tensor data.
 * Preserves aspect ratio with letterbox padding (grey 128).
 */
function frameToTensor(canvas, ctx, videoEl) {
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;
  const scale = Math.min(INPUT_SIZE / vw, INPUT_SIZE / vh);
  const sw = Math.round(vw * scale);
  const sh = Math.round(vh * scale);
  const dx = Math.floor((INPUT_SIZE - sw) / 2);
  const dy = Math.floor((INPUT_SIZE - sh) / 2);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(videoEl, dx, dy, sw, sh);

  const img = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const out = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0, p = 0; i < img.length; i += 4, p++) {
    out[p]             = img[i]     / 255;
    out[plane + p]     = img[i + 1] / 255;
    out[2 * plane + p] = img[i + 2] / 255;
  }
  return { data: out, scaleX: scale, scaleY: scale, padX: dx, padY: dy };
}

/**
 * Parse YOLOv8 output tensor [1, 84, 8400] → detection array.
 * Returns array of { x, y, w, h, cls, label, conf } in 640×640 pixel space.
 */
function parseDetections(outputData, numClasses, confThreshold, classMap) {
  // outputData: Float32Array of length 84 * 8400 = 705_600
  const numBoxes = 8400;
  const stride = 4 + numClasses;
  const dets = [];

  for (let b = 0; b < numBoxes; b++) {
    // Find max class score
    let maxScore = 0;
    let maxCls = 0;
    for (let c = 0; c < numClasses; c++) {
      const s = outputData[b + (4 + c) * numBoxes];
      if (s > maxScore) { maxScore = s; maxCls = c; }
    }
    if (maxScore < confThreshold) continue;
    if (classMap && !classMap[maxCls]) continue;

    const cx = outputData[b];
    const cy = outputData[b + numBoxes];
    const bw = outputData[b + 2 * numBoxes];
    const bh = outputData[b + 3 * numBoxes];
    dets.push({
      x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh,
      cls: maxCls,
      label: classMap?.[maxCls] ?? `cls${maxCls}`,
      conf: maxScore,
    });
  }

  // NMS (simple greedy)
  return nms(dets, 0.45);
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter + 1e-6);
}

function nms(dets, iouThresh) {
  const sorted = [...dets].sort((a, b) => b.conf - a.conf);
  const keep = [];
  const suppressed = new Set();
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[i].cls === sorted[j].cls && iou(sorted[i], sorted[j]) > iouThresh)
        suppressed.add(j);
    }
  }
  return keep;
}

/**
 * Map 640×640 detection bbox back to original video coordinates.
 */
function toVideoCoords(det, scaleX, scaleY, padX, padY) {
  return {
    ...det,
    x: (det.x - padX) / scaleX,
    y: (det.y - padY) / scaleY,
    w: det.w / scaleX,
    h: det.h / scaleY,
  };
}

// ---------------------------------------------------------------------------
// Basketball stat extraction helpers
// ---------------------------------------------------------------------------

/**
 * StatTracker — stateful class that processes per-frame detections and emits
 * basketball events (shot_attempt, shot_make, shot_miss, assist_candidate).
 *
 * Heuristics (tuned for FIBA half-court, eye-level tripod, 5 fps):
 *   - Shot attempt:  ball centroid rises > SHOT_RISE_PX over 3+ consecutive frames,
 *                    ball within SHOT_ZONE_Y of hoop centre.
 *   - Shot make:     ball overlaps hoop bbox for 1+ frames, then disappears.
 *   - Shot miss:     ball trajectory falls below hoop y after rise event.
 *   - Assist:        player with ball possession changes ≤2s before shot_attempt.
 */
class StatTracker {
  constructor({ onEvent }) {
    this.onEvent = onEvent;
    this.ballHistory = [];     // [{cx, cy, t}]
    this.hoopBbox = null;      // last seen hoop bbox
    this.shotActive = false;
    this.lastPossessor = null; // player id closest to ball before shot
  }

  update(dets, globalTMs) {
    const balls   = dets.filter(d => d.label === 'ball');
    const players = dets.filter(d => d.label === 'player');
    const hoops   = dets.filter(d => d.label === 'hoop');

    if (hoops.length) this.hoopBbox = hoops[0];

    if (!balls.length) {
      this._checkMiss(globalTMs);
      return;
    }

    const ball = balls.reduce((a, b) => b.conf > a.conf ? b : a);
    const bcx = ball.x + ball.w / 2;
    const bcy = ball.y + ball.h / 2;

    // Track nearest player to ball for assist detection
    let minDist = Infinity, nearestPlayer = null;
    for (const p of players) {
      const pcx = p.x + p.w / 2;
      const pcy = p.y + p.h / 2;
      const d = Math.hypot(pcx - bcx, pcy - bcy);
      if (d < minDist) { minDist = d; nearestPlayer = p; }
    }
    if (nearestPlayer && minDist < 80) this.lastPossessor = { ...nearestPlayer, t: globalTMs };

    this.ballHistory.push({ cx: bcx, cy: bcy, t: globalTMs });
    if (this.ballHistory.length > 30) this.ballHistory.shift();

    this._checkShot(ball, globalTMs);
    this._checkMake(ball, globalTMs);
  }

  _checkShot(ball, t) {
    if (this.shotActive) return;
    const hist = this.ballHistory;
    if (hist.length < 4) return;

    // Detect upward movement (y decreases = up in screen coords)
    const rise = hist.slice(-4);
    const deltaY = rise[0].cy - rise[rise.length - 1].cy;
    if (deltaY < 40) return; // not rising fast enough

    // Must be heading toward hoop zone
    if (this.hoopBbox) {
      const hoopCy = this.hoopBbox.y + this.hoopBbox.h / 2;
      if (ball.y > hoopCy + 200) return; // ball too far below hoop
    }

    this.shotActive = true;
    const assist = this._getAssistCandidate(t);
    this.onEvent({ type: 'shot_attempt', t, ball: { ...ball }, assist });
    if (assist) this.onEvent({ type: 'assist_candidate', t, player: assist });
  }

  _checkMake(ball, t) {
    if (!this.shotActive || !this.hoopBbox) return;
    const h = this.hoopBbox;
    const bcx = ball.x + ball.w / 2;
    const bcy = ball.y + ball.h / 2;
    const hcx = h.x + h.w / 2;
    const hcy = h.y + h.h / 2;
    if (Math.abs(bcx - hcx) < h.w * 0.6 && Math.abs(bcy - hcy) < h.h * 0.8) {
      this.onEvent({ type: 'shot_make', t, ball: { ...ball }, hoop: { ...this.hoopBbox } });
      this.shotActive = false;
    }
  }

  _checkMiss(t) {
    if (!this.shotActive) return;
    const hist = this.ballHistory;
    if (hist.length < 3) return;
    // Ball rising then disappeared or falling back down
    const last = hist[hist.length - 1];
    const elapsed = t - last.t;
    if (elapsed > 1500) { // no ball for >1.5s after shot
      this.onEvent({ type: 'shot_miss', t });
      this.shotActive = false;
    }
  }

  _getAssistCandidate(t) {
    if (!this.lastPossessor) return null;
    if (t - this.lastPossessor.t > 3000) return null; // >3s ago — not an assist
    return this.lastPossessor;
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

/**
 * @param {object}   opts
 * @param {string}   opts.modelUrl         URL to yolov8n_webgpu.onnx
 * @param {number}  [opts.sampleFps=5]     Frames to sample per second
 * @param {number}  [opts.confThreshold=0.4]  Min detection confidence
 * @param {boolean} [opts.trackStats=true]  Enable basketball stat extraction
 * @param {object}  [opts.classMap]        Override {classId: label} map
 * @param {function} opts.onDetections     Called each frame: (dets, videoEl, tMs)
 * @param {function} [opts.onEvent]        Called on stat events: (event)
 * @param {function} [opts.onLog]          Status log callback: (msg)
 */
export function useOnnxInference({
  modelUrl,
  sampleFps = 5,
  confThreshold = 0.4,
  trackStats = true,
  classMap = BASKETBALL_CLASSES,
  onDetections,
  onEvent,
  onLog,
}) {
  const [ready, setReady] = useState(false);
  const [ep, setEp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const sessionRef    = useRef(null);
  const canvasRef     = useRef(null);
  const ctxRef        = useRef(null);
  const rafRef        = useRef(null);
  const trackerRef    = useRef(null);
  const streamStartMs = useRef(null);

  const log = useCallback((msg) => {
    console.log('[useOnnxInference]', msg);
    onLog?.(msg);
  }, [onLog]);

  // ---- Load ORT + model once ----
  useEffect(() => {
    if (!modelUrl) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        log('Loading ONNX Runtime Web …');
        await loadScript(ORT_CDN);
        const ort = window.ort;
        ort.env.wasm.wasmPaths = ORT_WASM_PATH;

        log(`Fetching model: ${modelUrl}`);
        const resp = await fetch(modelUrl);
        if (!resp.ok) throw new Error(`Model fetch failed: ${resp.status}`);
        const buf = await resp.arrayBuffer();
        log(`Model downloaded (${(buf.byteLength / 1_048_576).toFixed(1)} MB)`);

        const tryEPs = 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'];
        let session = null, chosenEp = null;

        for (const candidate of tryEPs) {
          try {
            const s = await ort.InferenceSession.create(new Uint8Array(buf), {
              executionProviders: [candidate],
              graphOptimizationLevel: 'all',
            });
            // Warm-up probe — WebGPU can fail on first real run
            const warm = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
            const t = new ort.Tensor('float32', warm, [1, 3, INPUT_SIZE, INPUT_SIZE]);
            await s.run({ [s.inputNames[0]]: t });
            session = s; chosenEp = candidate;
            break;
          } catch (e) {
            log(`EP ${candidate} failed: ${e.message}`);
          }
        }
        if (!session) throw new Error('ONNX session failed on all EPs');
        if (cancelled) { session.release?.(); return; }

        sessionRef.current = session;

        // Canvas for frame sampling
        const c = document.createElement('canvas');
        c.width = INPUT_SIZE; c.height = INPUT_SIZE;
        canvasRef.current = c;
        ctxRef.current = c.getContext('2d', { willReadFrequently: true });

        if (trackStats && onEvent) {
          trackerRef.current = new StatTracker({ onEvent });
        }

        setEp(chosenEp);
        setReady(true);
        log(`Ready — EP: ${chosenEp}`);
      } catch (e) {
        if (!cancelled) { setError(e.message); log(`Error: ${e.message}`); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [modelUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Stream control ----
  const stopStream = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    trackerRef.current && (trackerRef.current = null);
    streamStartMs.current = null;
  }, []);

  const startStream = useCallback((videoEl) => {
    if (!sessionRef.current || !canvasRef.current) return;
    stopStream();
    if (trackStats && onEvent) {
      trackerRef.current = new StatTracker({ onEvent });
    }
    streamStartMs.current = performance.now();
    const ort = window.ort;
    const intervalMs = 1000 / sampleFps;
    let lastFrameMs = 0;

    const tick = async () => {
      if (!sessionRef.current) return;
      const now = performance.now();
      if (now - lastFrameMs >= intervalMs) {
        lastFrameMs = now;
        try {
          const { data, scaleX, scaleY, padX, padY } =
            frameToTensor(canvasRef.current, ctxRef.current, videoEl);
          const tensor = new ort.Tensor('float32', data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          const result = await sessionRef.current.run({ [sessionRef.current.inputNames[0]]: tensor });
          const raw = result[sessionRef.current.outputNames[0]].data;
          const numClasses = (raw.length / 8400) - 4;
          const dets640 = parseDetections(raw, numClasses, confThreshold, classMap);
          const dets = dets640.map(d => toVideoCoords(d, scaleX, scaleY, padX, padY));
          const globalTMs = Math.round(performance.now() - streamStartMs.current);
          onDetections?.(dets, videoEl, globalTMs);
          trackerRef.current?.update(dets, globalTMs);
        } catch (e) {
          log(`Inference error: ${e.message}`);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [sampleFps, confThreshold, classMap, trackStats, onEvent, onDetections, log, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  return { ready, loading, error, ep, startStream, stopStream };
}

export { BASKETBALL_CLASSES, StatTracker };
