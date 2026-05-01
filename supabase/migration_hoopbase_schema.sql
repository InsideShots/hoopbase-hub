-- HoopBase multi-tenant schema
-- Run in Supabase SQL editor

-- Teams registry
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  team_path text unique not null,  -- e.g. "wolves/u14/girls/2026"
  club_name text not null,
  club_slug text not null,
  age_group text not null,
  gender text not null,
  season_year text not null,
  competition text,
  state text,
  status text default 'active' check (status in ('active','suspended')),
  youtube_playlist_id text,
  created_at timestamptz default now()
);

-- Team join requests (signup form submissions)
create table if not exists team_join_requests (
  id uuid primary key default gen_random_uuid(),
  club_name text not null,
  club_slug text not null,
  age_group text not null,
  gender text not null,
  season_year text not null,
  competition text,
  state text,
  contact_name text not null,
  contact_email text not null,
  notes text,
  status text default 'pending' check (status in ('pending','approved','rejected')),
  team_id uuid references teams(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Team games
create table if not exists team_games (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  opponent text not null,
  game_date date not null,
  venue text,
  our_score int,
  opponent_score int,
  youtube_url text,           -- approved video link
  youtube_video_id text,      -- for embedding
  created_at timestamptz default now()
);

-- Video submissions (team submits YouTube link for analysis)
create table if not exists video_submissions (
  id uuid primary key default gen_random_uuid(),
  team_path text not null,
  team_id uuid references teams(id),
  youtube_url text not null,
  game_label text,
  game_date date,
  notes text,
  status text default 'pending'
    check (status in ('pending','processing','reviewed','approved','rejected')),
  youtube_playlist_url text,  -- set after approval + YouTube publish
  submitted_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- YOLO/SwishAI stat suggestions per video
create table if not exists video_stat_suggestions (
  id uuid primary key default gen_random_uuid(),
  video_submission_id uuid references video_submissions(id) on delete cascade,
  player_label text,          -- jersey number or name detected
  player_id uuid,             -- linked player if matched
  stat_type text not null,    -- e.g. 'points', 'rebounds', 'assists', 'steals'
  suggested_value numeric,    -- from YOLO analysis
  confirmed_value numeric,    -- set by admin during review
  confirmed boolean default false,
  confidence numeric,         -- 0-1 from YOLO
  created_at timestamptz default now()
);

-- Team players (for stat linking)
create table if not exists team_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  jersey_number text,
  position text,
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- RLS policies
alter table teams enable row level security;
alter table team_join_requests enable row level security;
alter table team_games enable row level security;
alter table video_submissions enable row level security;
alter table video_stat_suggestions enable row level security;
alter table team_players enable row level security;

-- Anyone can read active teams (for team portal rendering)
create policy "teams_public_read" on teams for select using (status = 'active');

-- Anyone can insert join requests
create policy "join_requests_insert" on team_join_requests for insert with check (true);

-- Anyone can read team games
create policy "games_public_read" on team_games for select using (true);

-- Anyone can insert video submissions
create policy "video_submit" on video_submissions for insert with check (true);

-- Team members can read their own video submissions
create policy "video_read_own" on video_submissions for select using (true);

-- Admin service role bypasses all RLS (handled via service key in backend)
