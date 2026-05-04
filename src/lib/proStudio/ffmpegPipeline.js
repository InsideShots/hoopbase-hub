// W20.H.3 — FFmpeg.wasm pipeline for Pro Studio.
// Concatenates a quarter bucket's segments into one MP4, with optional
// scoreboard overlay burn-in. Single-threaded core (no SharedArrayBuffer
// required) so it works without COOP/COEP headers on Base44/Vercel.
//
// API surface:
//   const pipe = await getFfmpegPipeline({ onProgress, onLog });
//   const out = await pipe.concatBucket({ files });          // Uint8Array MP4
//   const out = await pipe.burnScoreboard({ inputBytes, scoreboardPng, position });
//   const out = await pipe.concatAndBurn({ files, scoreboardPng });
//
// All operations write/read through the WASM virtual FS — no Node, no Storage.
// Caller is responsible for downloading via Blob/URL.createObjectURL.

const FFMPEG_CDN     = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js";
const FFMPEG_UTIL    = "https://unpkg.com/@ffmpeg/util@0.12.1/dist/umd/index.js";
const FFMPEG_CORE    = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let pipelineSingleton = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`load failed: ${src}`));
    document.head.appendChild(s);
  });
}

async function loadFfmpeg() {
  await loadScript(FFMPEG_UTIL);
  await loadScript(FFMPEG_CDN);
  const { FFmpeg } = window.FFmpegWASM;
  const { fetchFile, toBlobURL } = window.FFmpegUtil;
  // Cross-origin Worker construction is blocked when the page is served from
  // a different origin than the CDN. Pre-fetch every artifact as a same-origin
  // blob URL so FFmpeg can spawn its worker without a CORS preflight.
  const [coreURL, wasmURL, workerURL] = await Promise.all([
    toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${FFMPEG_CORE}/ffmpeg-core.wasm`, "application/wasm"),
    toBlobURL(FFMPEG_CDN, "text/javascript"),
  ]);
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({ coreURL, wasmURL, classWorkerURL: workerURL });
  return { ffmpeg, fetchFile };
}

/**
 * Lazy-load + cache a pipeline instance. First call ~30 MB download.
 */
export async function getFfmpegPipeline({ onProgress, onLog } = {}) {
  if (pipelineSingleton) return pipelineSingleton;
  const { ffmpeg, fetchFile } = await loadFfmpeg();
  if (onProgress) ffmpeg.on("progress", ({ progress, time }) => onProgress({ progress, time }));
  if (onLog) ffmpeg.on("log", ({ type, message }) => onLog({ type, message }));
  pipelineSingleton = makePipeline(ffmpeg, fetchFile);
  return pipelineSingleton;
}

function makePipeline(ffmpeg, fetchFile) {
  /**
   * Concat a quarter bucket's segments into one MP4. Uses the demuxer with
   * `-c copy` — no re-encode, fast, lossless. Requires all inputs share codec
   * + container (typical when all clips come from the same camera recording).
   * If codecs differ, fall back to concatTranscode().
   *
   * @param {Object} args
   * @param {File[]|Blob[]} args.files     ordered segment files (bucket_index order)
   * @returns {Promise<Uint8Array>}
   */
  async function concatBucket({ files }) {
    if (!files?.length) throw new Error("no files");
    const inputs = [];
    for (let i = 0; i < files.length; i++) {
      const name = `seg_${String(i).padStart(3, "0")}.mp4`;
      await ffmpeg.writeFile(name, await fetchFile(files[i]));
      inputs.push(name);
    }
    const list = inputs.map((n) => `file '${n}'`).join("\n");
    await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(list));
    await ffmpeg.exec(["-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "out.mp4"]);
    const out = await ffmpeg.readFile("out.mp4");
    // cleanup
    await Promise.all([...inputs.map((n) => ffmpeg.deleteFile(n).catch(() => {})), ffmpeg.deleteFile("concat.txt").catch(() => {})]);
    return out;
  }

  /**
   * Same as concatBucket but re-encodes to a uniform H.264 + AAC stream.
   * Use when source codecs differ (different cameras / phone mix).
   */
  async function concatTranscode({ files, crf = 23, preset = "veryfast" }) {
    if (!files?.length) throw new Error("no files");
    const inputs = [];
    for (let i = 0; i < files.length; i++) {
      const name = `seg_${String(i).padStart(3, "0")}.mp4`;
      await ffmpeg.writeFile(name, await fetchFile(files[i]));
      inputs.push(name);
    }
    const list = inputs.map((n) => `file '${n}'`).join("\n");
    await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(list));
    await ffmpeg.exec([
      "-f", "concat", "-safe", "0", "-i", "concat.txt",
      "-c:v", "libx264", "-preset", preset, "-crf", String(crf),
      "-c:a", "aac", "-b:a", "128k",
      "out.mp4",
    ]);
    const out = await ffmpeg.readFile("out.mp4");
    await Promise.all([...inputs.map((n) => ffmpeg.deleteFile(n).catch(() => {})), ffmpeg.deleteFile("concat.txt").catch(() => {})]);
    return out;
  }

  /**
   * Burn a scoreboard PNG over a video. Position controls overlay anchor.
   * @param {Object} args
   * @param {Uint8Array|File|Blob} args.inputBytes    source video
   * @param {File|Blob|Uint8Array} args.scoreboardPng overlay (PNG with alpha)
   * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'} [args.position='top-left']
   * @param {number} [args.padding=20] pixels from anchor edge
   */
  async function burnScoreboard({ inputBytes, scoreboardPng, position = "top-left", padding = 20 }) {
    await ffmpeg.writeFile("in.mp4", await fetchFile(inputBytes));
    await ffmpeg.writeFile("scoreboard.png", await fetchFile(scoreboardPng));
    const overlay = {
      "top-left":     `${padding}:${padding}`,
      "top-right":    `main_w-overlay_w-${padding}:${padding}`,
      "bottom-left":  `${padding}:main_h-overlay_h-${padding}`,
      "bottom-right": `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`,
    }[position];
    await ffmpeg.exec([
      "-i", "in.mp4",
      "-i", "scoreboard.png",
      "-filter_complex", `[0:v][1:v]overlay=${overlay}[v]`,
      "-map", "[v]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "copy",
      "out.mp4",
    ]);
    const out = await ffmpeg.readFile("out.mp4");
    await Promise.all(["in.mp4", "scoreboard.png"].map((n) => ffmpeg.deleteFile(n).catch(() => {})));
    return out;
  }

  /**
   * Convenience: concat (copy codec) + burn scoreboard in one pipeline call.
   * Internally re-encodes during the burn step (overlay can't be -c copy).
   */
  async function concatAndBurn({ files, scoreboardPng, position, padding }) {
    const concatted = await concatBucket({ files });
    return burnScoreboard({ inputBytes: concatted, scoreboardPng, position, padding });
  }

  /** Force a hard reset of the WASM FS — useful if a prior run errored mid-pipeline. */
  async function reset() {
    pipelineSingleton = null;
    try { await ffmpeg.terminate(); } catch (_) {}
  }

  return { concatBucket, concatTranscode, burnScoreboard, concatAndBurn, reset, _ffmpeg: ffmpeg };
}
