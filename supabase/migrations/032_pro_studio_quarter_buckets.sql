-- W20.H.2 — Pro Studio quarter-bucket support
-- Adds global-timeline columns to film_segments and a quarter_buckets view.
-- Multiple segments can share the same period (Q1_Part1, Q1_Part2 …);
-- their global_start_ms/global_end_ms form one virtual contiguous timeline
-- against the game clock, independent of file boundaries.
-- Safe to apply: additive columns only, view recreated.

-- 1. Additive columns -------------------------------------------------
alter table public.film_segments
  add column if not exists global_start_ms bigint,
  add column if not exists global_end_ms   bigint,
  add column if not exists bucket_index    int;

comment on column public.film_segments.global_start_ms is
  'Game-clock relative start within this period bucket (ms). 0 for first segment.';
comment on column public.film_segments.global_end_ms is
  'Game-clock relative end within this period bucket (ms). = global_start_ms + duration_ms.';
comment on column public.film_segments.bucket_index is
  'Order within a multi-clip period bucket (0,1,2 …). NULL for single-segment periods.';

create index if not exists film_segments_bucket_idx
  on public.film_segments (film_id, period, bucket_index);

-- 2. Quarter buckets view --------------------------------------------
-- One row per (film_id, period) with aggregate timeline + segment count.
drop view if exists public.quarter_buckets;
create view public.quarter_buckets as
select
  film_id,
  period,
  count(*)                            as segment_count,
  min(global_start_ms)                as bucket_start_ms,
  max(global_end_ms)                  as bucket_end_ms,
  coalesce(sum(duration_ms), 0)       as total_duration_ms,
  array_agg(id order by bucket_index) as segment_ids
from public.film_segments
where period is not null
group by film_id, period;

comment on view public.quarter_buckets is
  'Aggregated quarter buckets per film_session — one row per (film_id, period). '
  'bucket_*_ms are game-clock timestamps; total_duration_ms sums all segments.';

-- View RLS inherits from underlying table policies.
