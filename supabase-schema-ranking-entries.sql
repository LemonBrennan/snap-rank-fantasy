-- Snap Rank Fantasy: ranking_entries table + community_averages view
-- Run this once in Supabase's SQL Editor, after supabase-schema.sql

create table if not exists ranking_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_uid text not null,      -- stable player identifier, e.g. 'RB-christian mccaffrey'
  player_name text not null,
  player_pos text not null,      -- the player's real position (matters for Overall boards, which mix positions)
  board text not null,           -- which ranking this came from: 'RB' | 'QB' | 'WR' | 'TE' | 'OVERALL'
  rank int not null,             -- this player's position within that ranking (1 = top)
  format text not null,
  mode text not null,
  season int not null default 2026,
  week int not null default 0,   -- 0 for Rest-of-Season (see supabase-schema.sql for why 0, not null)
  updated_at timestamptz not null default now()
);

-- Same privacy model as user_rankings: a user's individual picks are only
-- ever visible to that user directly through this table.
alter table ranking_entries enable row level security;

create policy "Users can view their own ranking entries"
  on ranking_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert their own ranking entries"
  on ranking_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own ranking entries"
  on ranking_entries for delete
  using (auth.uid() = user_id);

create index if not exists ranking_entries_lookup_idx
  on ranking_entries (board, format, mode, season, week, player_uid);

-- Public aggregate view: this is how "community average" gets read on the
-- site. It only ever exposes averaged numbers -- never which individual
-- user picked what -- so it's safe to make readable by everyone, including
-- visitors who aren't logged in.
create or replace view community_averages as
select
  board, format, mode, season, week, player_uid, player_name, player_pos,
  round(avg(rank)::numeric, 1) as avg_rank,
  count(*) as num_rankers,
  min(rank) as best_rank,
  max(rank) as worst_rank
from ranking_entries
group by board, format, mode, season, week, player_uid, player_name, player_pos;

grant select on community_averages to anon, authenticated;
