-- Snap Rank Fantasy: user_rankings table
-- Run this once in Supabase's SQL Editor (Dashboard -> SQL Editor -> New query -> paste -> Run)

create table if not exists user_rankings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position text not null,       -- 'RB' | 'QB' | 'WR' | 'TE' | 'OVERALL'
  format text not null,         -- 'ppr' | 'half' | 'standard'
  mode text not null,           -- 'ROS' | 'WEEKLY'
  season int not null default 2026,
  week int,                     -- null for ROS, a week number for WEEKLY
  session_data jsonb not null,  -- the full ranking state (same shape already used for browser auto-save)
  updated_at timestamptz not null default now(),

  -- one saved ranking per user, per exact combination of position/format/mode/week
  unique (user_id, position, format, mode, season, week)
);

-- Row Level Security: every user can only ever see or touch their own rows.
-- This is enforced by Postgres itself, not just app code -- even if the
-- publishable key is public, this policy makes it impossible for anyone
-- to read or write another user's saved rankings.
alter table user_rankings enable row level security;

create policy "Users can view their own rankings"
  on user_rankings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rankings"
  on user_rankings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rankings"
  on user_rankings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rankings"
  on user_rankings for delete
  using (auth.uid() = user_id);

-- Speeds up "find this user's most recent ranking" lookups (used to offer
-- a resume prompt when someone logs in on a new device).
create index if not exists user_rankings_user_updated_idx
  on user_rankings (user_id, updated_at desc);
