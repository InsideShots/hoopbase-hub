// W20.H.6 — Dynamic homography hook for panning-tripod support.
// User clicks 4 court landmarks on the first frame; system tracks them as the
// camera pans/tilts; OpenCV computes the homography matrix H that maps any
// pixel (x, y) → static top-down "Radar Map" court coordinates.
//
// OpenCV.js (~10 MB) is loaded lazily from CDN on first use — only Pro Studio
// pages pay the cost. Cached on window.cv after first load.

import { useEffect, useRef, useCallback, useState } from "react";

const OPENCV_CDN = "https://docs.opencv.org/4.x/opencv.js";

/**
 * Standard FIBA half-court reference points in metres, then scaled to the
 * radar canvas. Override via opts.targetCourtCoords if Mark wants a different
 * orientation (full court, sideways, etc).
 */
const DEFAULT_TARGET_COURT_M = [
  [0, 0],       // top-left baseline corner
  [15, 0],      // top-right baseline corner (15 m wide)
  [15, 14],     // half-court right (14 m to half-court line)
  [0, 14],      // half-court left
];

let openCvLoadPromise = null;

function loadOpenCV() {
  if (window.cv && window.cv.Mat) return Promise.resolve(window.cv);
  if (openCvLoadPromise) return openCvLoadPromise;
  openCvLoadPromise = new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-opencv]`)) {
      // already injected, wait for ready
      const wait = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(wait);
          resolve(window.cv);
        }
      }, 50);
      return;
    }
    const s = document.createElement("script");
    s.src = OPENCV_CDN;
    s.async = true;
    s.dataset.opencv = "1";
    s.onload = () => {
      // OpenCV.js fires its own onRuntimeInitialized event
      const t0 = Date.now();
      const wait = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(wait);
          resolve(window.cv);
        } else if (Date.now() - t0 > 30000) {
          clearInterval(wait);
          reject(new Error("OpenCV.js init timeout"));
        }
      }, 100);
    };
    s.onerror = () => reject(new Error("Failed to fetch OpenCV.js"));
    document.head.appendChild(s);
  });
  return openCvLoadPromise;
}

/**
 * useHomography
 *
 * @param {Object} opts
 * @param {Array<[number, number]>} opts.sourcePoints     — 4 pixel coords clicked on the video frame
 * @param {Array<[number, number]>} [opts.targetPoints]   — 4 court coords (defaults to DEFAULT_TARGET_COURT_M)
 * @param {number} [opts.scale=20]                        — pixels-per-metre for radar canvas
 *
 * @returns {{
 *   ready: boolean,
 *   error: Error|null,
 *   H: number[][]|null,                  // 3x3 homography matrix
 *   mapPoint: (x:number, y:number) => [number, number]|null,
 *   reset: () => void,
 * }}
 */
export function useHomography({ sourcePoints, targetPoints, scale = 20 } = {}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [H, setH] = useState(null);
  const cvRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    loadOpenCV()
      .then((cv) => {
        if (cancelled) return;
        cvRef.current = cv;
        setReady(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e);
      });
    return () => { cancelled = true; };
  }, []);

  // Recompute H whenever source / target points change
  useEffect(() => {
    if (!ready || !cvRef.current) return;
    if (!sourcePoints || sourcePoints.length !== 4) { setH(null); return; }
    const target = (targetPoints || DEFAULT_TARGET_COURT_M).map(([x, y]) => [x * scale, y * scale]);
    const cv = cvRef.current;
    let srcMat, dstMat, hMat;
    try {
      srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, sourcePoints.flat());
      dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, target.flat());
      hMat = cv.findHomography(srcMat, dstMat);
      if (hMat.empty()) {
        setError(new Error("findHomography returned empty matrix — likely degenerate point selection"));
        setH(null);
        return;
      }
      // Copy out as plain JS 3x3 then free the Mat
      const out = [];
      for (let r = 0; r < 3; r++) {
        const row = [];
        for (let c = 0; c < 3; c++) row.push(hMat.doubleAt(r, c));
        out.push(row);
      }
      setH(out);
      setError(null);
    } catch (e) {
      setError(e);
      setH(null);
    } finally {
      srcMat?.delete();
      dstMat?.delete();
      hMat?.delete();
    }
  }, [ready, sourcePoints, targetPoints, scale]);

  const mapPoint = useCallback((x, y) => {
    if (!H) return null;
    // [x' y' w'] = H * [x y 1]
    const w = H[2][0] * x + H[2][1] * y + H[2][2];
    if (Math.abs(w) < 1e-9) return null;
    const xp = (H[0][0] * x + H[0][1] * y + H[0][2]) / w;
    const yp = (H[1][0] * x + H[1][1] * y + H[1][2]) / w;
    return [xp, yp];
  }, [H]);

  const reset = useCallback(() => {
    setH(null);
    setError(null);
  }, []);

  return { ready, error, H, mapPoint, reset };
}
