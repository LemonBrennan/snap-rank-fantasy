-- Fixes two things flagged in Supabase's security linter review:
--
-- 1. "community_averages" was a VIEW that (invisibly) ran with the
--    permissions of whoever created it, rather than the person querying
--    it -- necessary here, since the view has to look past each user's
--    individual privacy restriction to compute an average across
--    everyone. This rebuilds the same logic as an explicit function
--    instead, which is the safer, intentional, auditable way to do the
--    same thing (Supabase's own recommended pattern for this exact case).
--
-- 2. Enforces the "needs 5+ real rankers" rule directly in the database,
--    not just as a visual warning on the page. Previously, someone could
--    query the API directly (bypassing the website entirely) and see a
--    single-person's pick disguised as an "average" of one. Now the
--    database itself will never return a group with fewer than 5
--    contributors, regardless of how it's queried.
--
-- This does NOT delete or modify any data in user_rankings or
-- ranking_entries -- it only changes how the aggregate is computed and
-- served.

drop view if exists public.community_averages;

create or replace function public.get_community_averages(
  p_format text default null,  -- leave null to get every format at once
  p_mode text default 'ROS',
  p_season int default 2026,
  p_week int default 0,
  p_board text default null  -- leave null to get every board at once
)
returns table (
  board text,
  format text,
  mode text,
  season int,
  week int,
  player_uid text,
  player_name text,
  player_pos text,
  avg_rank numeric,
  num_rankers bigint,
  best_rank int,
  worst_rank int
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    re.board, re.format, re.mode, re.season, re.week,
    re.player_uid, re.player_name, re.player_pos,
    round(avg(re.rank)::numeric, 1) as avg_rank,
    count(*) as num_rankers,
    min(re.rank) as best_rank,
    max(re.rank) as worst_rank
  from public.ranking_entries re
  where (p_format is null or re.format = p_format)
    and re.mode = p_mode
    and re.season = p_season
    and re.week = p_week
    and (p_board is null or re.board = p_board)
  group by re.board, re.format, re.mode, re.season, re.week, re.player_uid, re.player_name, re.player_pos
  having count(*) >= 5;
$$;

-- Lets both logged-in and logged-out visitors call this function --
-- matches the original view's intent of being publicly readable, since
-- it only ever returns averaged numbers, never individual picks.
grant execute on function public.get_community_averages to anon, authenticated;
