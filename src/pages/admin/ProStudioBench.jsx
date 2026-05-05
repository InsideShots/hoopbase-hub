// W20.H.10 — Pro Studio compute budget audit (hoopbase.com.au admin tool).
// Lazy-loads FFmpeg.wasm + onnxruntime-web from CDN.
// Run on a target coach laptop; copy the verdict block into docs/PRO_STUDIO.md.
//
// W20.H.4-pre: also tests yolov8n_webgpu.onnx (last-axis Softmax) when the
// patched model is present at /models/yolov8n_webgpu.onnx.  Generates both
// 720p and 1080p synthetic clips so both resolutions are audited.

import { useState, useRef, useCallback } from "react";

const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.js";
const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
const FFMPEG_UTIL_CDN = "https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js";
const FFMPEG_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
// Stock YOLOv8n — DFL Softmax(axis=1) forces WASM fallback on WebGPU.
const YOLO_MODEL_URL_STOCK = "https://cdn.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx";
// Patched model — produced by scripts/export_webgpu_model.py.
// Upload to Supabase Storage and update this URL to enable WebGPU bench.
const YOLO_MODEL_URL_WEBGPU = "/models/yolov8n_webgpu.onnx";

const SAMPLE_FPS = 5;
const BENCH_SECONDS = 8;
const INPUT_SIZE = 640;
const PARALLEL_STREAMS = 4;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function fmtMB(bytes) {
  if (!bytes && bytes !== 0) return "—";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function memSnapshot() {
  if (performance.memory) {
    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
    };
  }
  return null;
}

async function loadVideoIntoElement(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  await new Promise((res, rej) => {
    v.onloadedmetadata = res;
    v.onerror = () => rej(new Error("video load failed"));
  });
  return { el: v, url, durationMs: v.duration * 1000, w: v.videoWidth, h: v.videoHeight };
}

function frameToTensor(canvas, ctx, sourceEl) {
  ctx.drawImage(sourceEl, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const img = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;
  const out = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0, p = 0; i < img.length; i += 4, p++) {
    out[p] = img[i] / 255;
    out[plane + p] = img[i + 1] / 255;
    out[2 * plane + p] = img[i + 2] / 255;
  }
  return out;
}

const TOTAL_STAGES = 6;

// Resolution profiles for synthetic FFmpeg bench clips
const RES_PROFILES = {
  "720p":  { w: 1280,  h: 720  },
  "1080p": { w: 1920,  h: 1080 },
};

export default function ProStudioBench() {
  const [files, setFiles] = useState([]);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [progress, setProgress] = useState({ stage: 0, label: "Idle", pct: 0, etaMs: null });
  const [useWebgpuModel, setUseWebgpuModel] = useState(false);
  const [resProfile, setResProfile] = useState("720p");
  const logRef = useRef([]);

  const append = useCallback((line) => {
    const t = new Date().toLocaleTimeString();
    logRef.current = [...logRef.current, `[${t}] ${line}`];
    setLog([...logRef.current]);
  }, []);

  const setStage = useCallback((stage, label) => {
    setProgress({ stage, label, pct: 0, etaMs: null });
  }, []);

  const setPct = useCallback((pct, etaMs = null) => {
    setProgress((p) => ({ ...p, pct: Math.min(1, Math.max(0, pct)), etaMs }));
  }, []);

  const onPick = (e) => setFiles(Array.from(e.target.files || []).slice(0, PARALLEL_STREAMS));

  const runBench = async () => {
    if (files.length === 0) {
      append("Pick 1–4 sample video files first.");
      return;
    }
    setRunning(true);
    setVerdict(null);
    logRef.current = [];
    setLog([]);
    const overall = { startedAt: new Date().toISOString() };
    const modelUrl = useWebgpuModel ? YOLO_MODEL_URL_WEBGPU : YOLO_MODEL_URL_STOCK;
    const { w: synthW, h: synthH } = RES_PROFILES[resProfile];
    try {
      const memBefore = memSnapshot();
      append(`UA: ${navigator.userAgent}`);
      append(`Hardware concurrency: ${navigator.hardwareConcurrency} threads`);
      append(`WebGPU: ${"gpu" in navigator ? "yes" : "no"}`);
      append(`SharedArrayBuffer: ${typeof SharedArrayBuffer !== "undefined" ? "yes" : "no"}`);
      append(`Model: ${useWebgpuModel ? "yolov8n_webgpu (patched)" : "yolov8n (stock)"}`);
      append(`Synthetic resolution: ${resProfile} (${synthW}×${synthH})`);
      append(`Memory before: used=${fmtMB(memBefore?.used)} limit=${fmtMB(memBefore?.limit)}`);

      // ---- Stage 1: video decode setup ----
      setStage(1, "Loading clips");
      append("Stage 1 — loading clips into HTMLVideoElements …");
      const sources = [];
      for (let i = 0; i < PARALLEL_STREAMS; i++) {
        const f = files[i % files.length];
        const v = await loadVideoIntoElement(f);
        sources.push(v);
        setPct((i + 1) / PARALLEL_STREAMS);
        append(`  clip ${i + 1}: ${f.name} ${v.w}×${v.h} ${v.durationMs.toFixed(0)} ms`);
      }
      const memAfterDecodeSetup = memSnapshot();
      append(`Memory after decode setup: used=${fmtMB(memAfterDecodeSetup?.used)}`);

      // ---- Stage 2: ONNX Runtime Web ----
      setStage(2, "Loading ONNX runtime + model");
      append("Stage 2 — loading onnxruntime-web from CDN …");
      const t0Ort = performance.now();
      await loadScript(ORT_CDN);
      const ort = window.ort;
      ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
      append(`  ort loaded in ${(performance.now() - t0Ort).toFixed(0)} ms`);

      append(`Stage 2b — fetching ONNX model (${modelUrl}) …`);
      const t0Model = performance.now();
      // Stream-fetch with progress so we can show a real download bar.
      const resp = await fetch(modelUrl);
      const total = +resp.headers.get("content-length") || 0;
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      const fetchStart = performance.now();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total) {
          const pct = received / total;
          const elapsedMs = performance.now() - fetchStart;
          const etaMs = pct > 0.02 ? (elapsedMs / pct) - elapsedMs : null;
          setPct(pct, etaMs);
        }
      }
      const modelBytes = new Uint8Array(received);
      let offset = 0;
      for (const c of chunks) { modelBytes.set(c, offset); offset += c.length; }
      append(`  fetched ${fmtMB(received)} in ${(performance.now() - fetchStart).toFixed(0)} ms`);

      const tryEPs = "gpu" in navigator ? ["webgpu", "wasm"] : ["wasm"];
      let session = null;
      let ep = null;
      for (const candidate of tryEPs) {
        try {
          const s = await ort.InferenceSession.create(modelBytes, {
            executionProviders: [candidate],
            graphOptimizationLevel: "all",
          });
          // Warm-up: WebGPU often loads fine but fails on first inference
          // (e.g. unsupported Softmax axis in YOLOv8 DFL head). Probe before committing.
          const warmInput = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
          const warmTensor = new ort.Tensor("float32", warmInput, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          await s.run({ [s.inputNames[0]]: warmTensor });
          session = s;
          ep = candidate;
          break;
        } catch (err) {
          append(`  EP ${candidate} failed: ${err.message}`);
        }
      }
      if (!session) throw new Error("ONNX session creation/warm-up failed on all EPs");
      append(`  model loaded + warmed in ${(performance.now() - t0Model).toFixed(0)} ms (EP: ${ep})`);

      // ---- Stage 3: inference loop ----
      setStage(3, `Inference (${PARALLEL_STREAMS}× streams)`);
      append(`Stage 3 — running ${PARALLEL_STREAMS}× streams @ ${SAMPLE_FPS}fps for ${BENCH_SECONDS}s …`);
      const canvases = sources.map(() => {
        const c = document.createElement("canvas");
        c.width = INPUT_SIZE;
        c.height = INPUT_SIZE;
        return { c, ctx: c.getContext("2d", { willReadFrequently: true }) };
      });
      await Promise.all(sources.map((s) => s.el.play().catch(() => {})));
      const inferenceTimes = [];
      const benchStartMs = performance.now();
      const benchEnd = benchStartMs + BENCH_SECONDS * 1000;
      const intervalMs = 1000 / SAMPLE_FPS;
      let frames = 0;
      while (performance.now() < benchEnd) {
        const tickStart = performance.now();
        for (let i = 0; i < sources.length; i++) {
          const data = frameToTensor(canvases[i].c, canvases[i].ctx, sources[i].el);
          const tensor = new ort.Tensor("float32", data, [1, 3, INPUT_SIZE, INPUT_SIZE]);
          const inferStart = performance.now();
          const inputName = session.inputNames[0];
          await session.run({ [inputName]: tensor });
          inferenceTimes.push(performance.now() - inferStart);
          frames++;
        }
        const elapsed = performance.now() - benchStartMs;
        const totalMs = BENCH_SECONDS * 1000;
        setPct(elapsed / totalMs, totalMs - elapsed);
        const tickElapsed = performance.now() - tickStart;
        if (tickElapsed < intervalMs) await new Promise((r) => setTimeout(r, intervalMs - tickElapsed));
      }
      sources.forEach((s) => s.el.pause());
      const memAfterInfer = memSnapshot();
      const avg = inferenceTimes.reduce((a, b) => a + b, 0) / inferenceTimes.length;
      const sorted = [...inferenceTimes].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      append(`  total frames: ${frames} (${(frames / BENCH_SECONDS).toFixed(1)} fps aggregate)`);
      append(`  inference ms: avg=${avg.toFixed(1)} p95=${p95.toFixed(1)}`);
      append(`  Memory after inference: used=${fmtMB(memAfterInfer?.used)}`);

      // ---- Stage 3b: native-resolution decode + draw stress ----
      setStage(4, `Native-res draw (${sources[0].w}×${sources[0].h})`);
      append(`Stage 3b — decoding ${PARALLEL_STREAMS}× streams at NATIVE resolution (${sources[0].w}×${sources[0].h}) for 4s …`);
      const nativeCanvases = sources.map((s) => {
        const c = document.createElement("canvas");
        c.width = s.w;
        c.height = s.h;
        return { c, ctx: c.getContext("2d") };
      });
      await Promise.all(sources.map((s) => s.el.play().catch(() => {})));
      const drawTimes = [];
      const nativeStart = performance.now();
      const nativeEnd = nativeStart + 4000;
      let nativeFrames = 0;
      while (performance.now() < nativeEnd) {
        const tickStart = performance.now();
        for (let i = 0; i < sources.length; i++) {
          const t0 = performance.now();
          nativeCanvases[i].ctx.drawImage(sources[i].el, 0, 0, sources[i].w, sources[i].h);
          drawTimes.push(performance.now() - t0);
          nativeFrames++;
        }
        const elapsed = performance.now() - nativeStart;
        setPct(elapsed / 4000, 4000 - elapsed);
        const tickElapsed = performance.now() - tickStart;
        if (tickElapsed < intervalMs) await new Promise((r) => setTimeout(r, intervalMs - tickElapsed));
      }
      sources.forEach((s) => s.el.pause());
      const avgDraw = drawTimes.reduce((a, b) => a + b, 0) / drawTimes.length;
      const memAfterNative = memSnapshot();
      append(`  native draws: ${nativeFrames} frames, avg ${avgDraw.toFixed(1)} ms/frame`);
      append(`  Memory after native draw: used=${fmtMB(memAfterNative?.used)}`);

      // ---- Stage 5: FFmpeg.wasm concat (synthetic 720p clips so it always finishes) ----
      setStage(5, "Loading FFmpeg.wasm");
      append("Stage 5 — loading FFmpeg.wasm (single-threaded core) …");
      const t0Ff = performance.now();
      await loadScript(FFMPEG_UTIL_CDN);
      await loadScript(FFMPEG_CDN);
      const { FFmpeg } = window.FFmpegWASM;
      const { toBlobURL } = window.FFmpegUtil;
      const [coreURL, wasmURL, workerURL] = await Promise.all([
        toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
        toBlobURL(`${FFMPEG_CDN}`, "text/javascript"),
      ]);
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => {
        if (progress >= 0 && progress <= 1) setPct(progress);
      });
      await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: workerURL });
      append(`  ffmpeg loaded in ${(performance.now() - t0Ff).toFixed(0)} ms`);

      // Generate synthetic clips at selected resolution (no OOM — synthetic data).
      append(`Stage 5b — generating 4× 5s synthetic ${resProfile} clips (${synthW}×${synthH}) …`);
      setStage(5, `Generating synthetic ${resProfile} clips`);
      const t0Synth = performance.now();
      for (let i = 0; i < PARALLEL_STREAMS; i++) {
        await ffmpeg.exec([
          "-f", "lavfi", "-i", `testsrc=duration=5:size=${synthW}x${synthH}:rate=30`,
          "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
          `in${i}.mp4`,
        ]);
        setPct((i + 1) / PARALLEL_STREAMS);
      }
      append(`  generated in ${(performance.now() - t0Synth).toFixed(0)} ms`);

      append(`Stage 5c — concat 4 synthetic ${resProfile} clips (copy codec) …`);
      setStage(5, "Concatenating clips");
      const t0Cat = performance.now();
      const list = Array.from({ length: PARALLEL_STREAMS }, (_, i) => `file 'in${i}.mp4'`).join("\n");
      await ffmpeg.writeFile("list.txt", new TextEncoder().encode(list));
      await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "out.mp4"]);
      const out = await ffmpeg.readFile("out.mp4");
      const concatMs = performance.now() - t0Cat;
      const memAfterFf = memSnapshot();
      append(`  concat done in ${concatMs.toFixed(0)} ms — output ${fmtMB(out.byteLength)}`);
      append(`  Memory after ffmpeg: used=${fmtMB(memAfterFf?.used)}`);

      // ---- Stage 6: 1080p cross-check (only when 720p profile selected) ----
      let concat1080Ms = null;
      let memAfter1080 = null;
      if (resProfile === "720p") {
        setStage(6, "1080p cross-check");
        append("Stage 6 — 1080p cross-check: gen 2× 5s synthetic 1920×1080 clips …");
        const t0_1080 = performance.now();
        for (let i = 0; i < 2; i++) {
          await ffmpeg.exec([
            "-f", "lavfi", "-i", "testsrc=duration=5:size=1920x1080:rate=30",
            "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
            `hd${i}.mp4`,
          ]);
          setPct((i + 1) / 2);
        }
        const list1080 = "file 'hd0.mp4'\nfile 'hd1.mp4'";
        await ffmpeg.writeFile("list1080.txt", new TextEncoder().encode(list1080));
        await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "list1080.txt", "-c", "copy", "out1080.mp4"]);
        const out1080 = await ffmpeg.readFile("out1080.mp4");
        concat1080Ms = performance.now() - t0_1080;
        memAfter1080 = memSnapshot();
        append(`  1080p concat: ${concat1080Ms.toFixed(0)} ms — ${fmtMB(out1080.byteLength)}`);
        append(`  Memory after 1080p: used=${fmtMB(memAfter1080?.used)}`);
        const ratio1080 = concat1080Ms / concatMs;
        append(`  1080p/720p concat ratio: ${ratio1080.toFixed(2)}× — ${ratio1080 < 2.5 ? "1080p VIABLE" : "1080p may strain low-end hardware"}`);
      }

      // ---- Verdict ----
      const peakMb = Math.max(
        memBefore?.used || 0,
        memAfterDecodeSetup?.used || 0,
        memAfterInfer?.used || 0,
        memAfterNative?.used || 0,
        memAfterFf?.used || 0,
        memAfter1080?.used || 0,
      ) / 1024 / 1024;
      const v = {
        ts: overall.startedAt,
        ua: navigator.userAgent,
        ep,
        model: useWebgpuModel ? "yolov8n_webgpu" : "yolov8n_stock",
        resProfile,
        synthRes: `${synthW}×${synthH}`,
        avgInferMs: avg,
        p95InferMs: p95,
        framesPerSecond: frames / BENCH_SECONDS,
        avgNativeDrawMs: avgDraw,
        ffmpegConcatMs: concatMs,
        concat1080Ms,
        peakHeapMb: peakMb.toFixed(0),
        webgpu: "gpu" in navigator,
        sab: typeof SharedArrayBuffer !== "undefined",
        sourceRes: `${sources[0].w}×${sources[0].h}`,
      };
      setVerdict(v);
      append("Verdict ready — copy block below into docs/PRO_STUDIO.md.");
    } catch (e) {
      append(`ERROR: ${e.message}`);
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white mb-1">Pro Studio Bench</h1>
      <p className="text-sm text-gray-400 mb-6">W20.H.10 / W20.H.4-pre — compute + WebGPU audit</p>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4 space-y-3 text-sm text-gray-300">
        <p>
          Worst-case load: 4 parallel streams @ {SAMPLE_FPS} fps through YOLOv8n ONNX + FFmpeg.wasm concat.
          Now also tests 1080p synthetic concat and the WebGPU-patched model.
        </p>
        <p>Pick 1–4 sample files. Same files replay if fewer than 4 are picked.</p>

        {/* Model selector */}
        <div className="flex gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="model" value="stock" checked={!useWebgpuModel}
              onChange={() => setUseWebgpuModel(false)} disabled={running} />
            <span>Stock yolov8n (WASM fallback expected)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="model" value="webgpu" checked={useWebgpuModel}
              onChange={() => setUseWebgpuModel(true)} disabled={running} />
            <span>Patched yolov8n_webgpu <span className="text-amber-400">(needs export_webgpu_model.py first)</span></span>
          </label>
        </div>

        {/* Resolution selector */}
        <div className="flex gap-3 flex-wrap">
          {Object.keys(RES_PROFILES).map(k => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="res" value={k} checked={resProfile === k}
                onChange={() => setResProfile(k)} disabled={running} />
              <span>{k} synthetic{k === "720p" ? " + 1080p cross-check" : ""}</span>
            </label>
          ))}
        </div>

        <input
          type="file"
          accept="video/*"
          multiple
          onChange={onPick}
          className="block w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-500 file:text-white file:font-semibold hover:file:bg-brand-400"
          disabled={running}
        />
        <button
          onClick={runBench}
          disabled={running || files.length === 0}
          className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? "Running…" : "Start bench"}
        </button>
      </div>

      {running && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-200 font-medium">
              Stage {progress.stage}/{TOTAL_STAGES}: {progress.label}
            </span>
            <span className="text-gray-400 tabular-nums">
              {(progress.pct * 100).toFixed(0)}%
              {progress.etaMs != null && progress.etaMs > 0 && (
                <span className="ml-3">~{Math.ceil(progress.etaMs / 1000)}s left</span>
              )}
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 transition-all duration-200"
              style={{ width: `${(progress.pct * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="bg-black text-green-300 rounded-2xl p-3 mb-4 font-mono text-xs whitespace-pre-wrap max-h-96 overflow-auto border border-gray-800">
          {log.join("\n")}
        </div>
      )}

      {verdict && (
        <div className="bg-amber-900/20 border border-amber-700/40 rounded-2xl p-4 text-sm text-gray-200">
          <h3 className="font-semibold mb-2">Copy this into docs/PRO_STUDIO.md → Compute budget</h3>
          <pre className="bg-gray-950 p-3 rounded-lg text-xs overflow-auto whitespace-pre text-green-300">
{`### Bench result — ${verdict.ts}
- UA: ${verdict.ua}
- Model: ${verdict.model}  Source clips: ${verdict.sourceRes} (inference always at 640×640)
- ONNX EP: ${verdict.ep}  WebGPU available: ${verdict.webgpu}  SharedArrayBuffer: ${verdict.sab}
- Inference (640×640, 4 streams): avg ${verdict.avgInferMs.toFixed(1)} ms | p95 ${verdict.p95InferMs.toFixed(1)} ms | aggregate ${verdict.framesPerSecond.toFixed(1)} fps
- Native-res draw (${verdict.sourceRes}, 4 streams): avg ${verdict.avgNativeDrawMs.toFixed(1)} ms/frame
- FFmpeg concat (4× ${verdict.synthRes} clips): ${verdict.ffmpegConcatMs.toFixed(0)} ms${verdict.concat1080Ms != null ? `\n- FFmpeg concat (2× 1080p cross-check): ${verdict.concat1080Ms.toFixed(0)} ms — ${(verdict.concat1080Ms / verdict.ffmpegConcatMs).toFixed(2)}× ratio — ${verdict.concat1080Ms / verdict.ffmpegConcatMs < 2.5 ? "1080p VIABLE" : "1080p marginal"}` : ""}
- Peak JS heap: ${verdict.peakHeapMb} MB
- Inference verdict: ${verdict.avgInferMs < 80 ? `PASS (${verdict.ep} EP)` : `REVIEW — ${verdict.avgInferMs.toFixed(0)} ms/frame exceeds 80 ms budget`}
- 1080p verdict: ${verdict.concat1080Ms != null ? (verdict.concat1080Ms / verdict.ffmpegConcatMs < 2.5 ? "VIABLE — use 1080p for single-stream Pro Studio" : "MARGINAL — cap at 720p on this hardware") : "not tested"}`}
          </pre>
        </div>
      )}
    </div>
  );
}
