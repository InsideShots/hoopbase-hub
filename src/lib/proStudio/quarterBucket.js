// W20.H.2 — Pro Studio quarter-bucket state manager.
// Pure JS (no React deps) so it can be unit-tested + reused by Edge Functions.
//
// A "bucket" = all segments for one period (Q1, Q2, …) of one film_session.
// Segments are ordered by bucket_index and stitched into a virtual contiguous
// game-clock timeline. Event timestamps are stored as `globalMs` against this
// timeline, independent of the underlying file boundaries.
//
// Schema reference: supabase/migrations/032_pro_studio_quarter_buckets.sql

/**
 * Build buckets from a flat list of film_segments rows.
 * @param {Array<{id,film_id,period,bucket_index,duration_ms,source_path}>} segments
 * @returns {Object<string, {period, segments, totalDurationMs}>}
 */
export function groupIntoBuckets(segments) {
  const out = {};
  for (const s of segments) {
    if (!s.period) continue;
    if (!out[s.period]) out[s.period] = { period: s.period, segments: [], totalDurationMs: 0 };
    out[s.period].segments.push(s);
  }
  for (const period of Object.keys(out)) {
    out[period].segments.sort((a, b) => (a.bucket_index ?? 0) - (b.bucket_index ?? 0));
    out[period].totalDurationMs = out[period].segments.reduce(
      (sum, s) => sum + (s.duration_ms || 0), 0
    );
  }
  return out;
}

/**
 * Compute global_start_ms / global_end_ms for every segment in a bucket.
 * Mutates input order; returns array with derived fields filled in.
 * Also assigns bucket_index if missing.
 */
export function computeGlobalTimeline(segments) {
  let cursor = 0;
  return segments.map((s, i) => {
    const start = cursor;
    const end = cursor + (s.duration_ms || 0);
    cursor = end;
    return { ...s, bucket_index: s.bucket_index ?? i, global_start_ms: start, global_end_ms: end };
  });
}

/**
 * Convert a global game-clock ms → (segment, fileOffsetMs).
 * Returns null if the timestamp falls outside any segment.
 * @param {Array} bucketSegments — segments WITH global_start_ms / global_end_ms set
 * @param {number} globalMs
 */
export function globalToFileOffset(bucketSegments, globalMs) {
  for (const s of bucketSegments) {
    if (globalMs >= s.global_start_ms && globalMs <= s.global_end_ms) {
      return { segment: s, fileOffsetMs: globalMs - s.global_start_ms };
    }
  }
  return null;
}

/**
 * Inverse: (segment_id, fileOffsetMs) → globalMs.
 * Used when AI emits an event at frame N of a clip and we need to log
 * it against the global timeline.
 */
export function fileOffsetToGlobal(bucketSegments, segmentId, fileOffsetMs) {
  const s = bucketSegments.find((x) => x.id === segmentId);
  if (!s) return null;
  return (s.global_start_ms ?? 0) + fileOffsetMs;
}

/**
 * Return total bucket duration, accounting for any gaps (there shouldn't be —
 * segments are stitched contiguously — but defensive in case of bad data).
 */
export function bucketDurationMs(bucketSegments) {
  if (!bucketSegments?.length) return 0;
  return bucketSegments[bucketSegments.length - 1].global_end_ms ?? 0;
}
