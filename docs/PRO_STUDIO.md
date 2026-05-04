# MyCourtStats Pro Studio — Architecture Blueprint

**Workstream:** W20 Phase H (`HOOPBASE_MASTER_PLAN.md`)
**Status:** Gate doc — describes the target. No code shipped yet.
**Owner:** Mark Edmonds + Claude

---

## Mission

Free Synergy-equivalent for Australian basketball. Browser-based video analysis tool that delivers professional stat tagging + YouTube-ready overlays at **zero server cost**. All AI inference and video rendering runs on the coach's laptop.

---

## Pillars

1. **Multi-clip quarter handling** — coaches drop multiple files (pause/break tolerant) into a single Quarter Bucket. System treats them as one contiguous game-clock timeline.
2. **Zero-footprint compute** — AI tracking via ONNX Runtime Web. Video stitching/render via FFmpeg.wasm. No backend GPU. No paid Modal/Replicate.
3. **Dynamic tripod support** — handles manual pan/tilt at eye-level via global motion estimation + dynamic homography.
4. **Hybrid stat verification** — AI suggests (shots, steals, possessions); human confirms/edits. 100% accuracy by design.

---

## Stack

| Layer | Component | Implementation |
|---|---|---|
| Frontend | React / Vite | Studio UI, multi-file uploads, state |
| Database | Supabase | Rosters, game IDs, verified events on global timeline |
| AI inference | YOLOv11-nano (ONNX) | Players, jerseys, ball, hoop |
| Tracking | BoT-SORT / ByteTrack (JS) | Identity across pans + clip breaks |
| Math engine | OpenCV.js | Perspective transform / homography matrix |
| Video engine | FFmpeg.wasm | Concat clips + burn scoreboard overlay |

---

## Multi-clip quarter workflow

### Quarter Bucket

Instead of one file per quarter, users manage a Segment List:

- **Input:** `Q1_Part1.mp4`, `Q1_Part2.mp4`, …
- **Global timeline:** virtual contiguous timeline (Part 1 ends at 05:00 → Part 2 starts at 05:01).
- **Analysis:** AI scans each clip. Event timestamps saved relative to the **game clock**, not file duration.

### Schema

`quarter_segments(film_id, period, segment_index, source_path, duration_ms, global_start_ms, global_end_ms)`

Events reference `global_t_ms` on `film_sessions`; renderer maps back to (segment, file_offset) on demand.

---

## Dynamic homography (panning tripod)

1. **Calibration** — user clicks 4 court landmarks on the first clip of each quarter.
2. **Tracking** — AI tracks the 4 landmarks as the tripod pans/tilts.
3. **Transformation** — homography matrix `H` maps pixel coords → static 2D top-down "Radar Map".

`useHomography(videoEl, landmarks)` hook → returns `{ H, mapPoint(x, y) → courtXY }`.

---

## Final game stitching

End of Q4:

1. **Verify** — coach confirms all stats across all clips.
2. **Concatenate** — FFmpeg.wasm `concat` demuxer joins all quarter segments into `Full_Game.mp4`.
3. **Overlay** — final broadcast scoreboard burned over stitched video.
4. **Publish** — upload to team's unlisted playlist on master HoopBase YouTube channel (W20.E).
5. **Delete** — local Storage clips deleted on YouTube success.

---

## Verification Studio

1. **Upload** — drop multiple clips into Q1/Q2/Q3/Q4 buckets.
2. **AI scan** — browser ONNX pass marks suspected stats with confidence scores.
3. **Review sidebar:**
   - Pending events listed by global game time.
   - One-click seek → jumps player to clip + timestamp **`T-3s`** for context.
   - Validation buttons: **Confirm / Edit / Reject**.
4. **Add missed stats** — reviewer scrubs anywhere, adds a stat the AI missed (same UI).
5. **Lock** — session marked `completed` when queue cleared + reviewer confirms.

---

## Compute budget (gate)

Baseline coach laptop: **16GB MacBook Air (M2)**.

Must concurrently handle:

- 4× 720p quarter buckets in memory (decoded as needed)
- ONNX Runtime Web (WebGPU preferred, WASM fallback)
- FFmpeg.wasm concat + render

Budget audit (W20.H.10) decides whether 1080p is viable or 720p is the cap.

---

## Build order

| Step | Task | Status |
|---|---|---|
| 1 | This doc | ✅ shipped |
| 2 | Compute audit (W20.H.10) | 🚧 bench page shipped at `/ProStudioBench`; awaiting Mark's run |
| 3 | Quarter-bucket state (W20.H.2) | ~ scaffolding shipped (migration unapplied + state-mgr lib) |
| 4 | FFmpeg.wasm concat (W20.H.3) | ~ pipeline lib shipped; UI pending |
| 5 | ONNX YOLOv11-nano (W20.H.4) | ⏸ gated on W5.A accuracy bar |
| 6 | Tracking (W20.H.5) | ⏸ gated on step 5 |
| 7 | Homography hook (W20.H.6) | ~ static H shipped; landmark tracking pending detector (5) |
| 8 | Verification Studio (W20.H.7) | ⏸ gated on steps 5–7 |
| 9 | Final stitch + publish (W20.H.8) | ⏸ gated on step 4 + W20.E |
| 10 | `gemini_helper.py` (W20.H.9) | ✅ shipped |

---

## Out of scope (this doc)

- Storage bucket lifecycle → W5.B
- YouTube uploader / quota → W5.C + W20.E.0
- Possession schema / play types / PPP rankings → W18
- Shot taxonomy → W14.2
- Player-facing clip review → W20.F

---

## Open questions

- Which JS port of BoT-SORT/ByteTrack is maintained enough to ship? May need to write a minimal one.
- WebGPU adoption — fallback to WASM acceptable for accuracy/throughput on older laptops?
- ONNX model hosting — bundled in app (~10MB nano) vs lazy-fetched from CDN?
- Crash recovery — if browser tab crashes mid-review, do we IndexedDB-persist the candidate queue + overlay state?
