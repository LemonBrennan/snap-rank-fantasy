-- One-time cleanup: removes the duplicate rows created by the NULL-week
-- bug (before this fix, every save created a new row instead of updating
-- the existing one). Keeps only the single most recently updated row per
-- user/position/format/mode, and normalizes week to 0 so future saves
-- correctly match against it.

delete from user_rankings a
using user_rankings b
where a.user_id = b.user_id
  and a.position = b.position
  and a.format = b.format
  and a.mode = b.mode
  and a.season = b.season
  and a.updated_at < b.updated_at;

-- Normalize any remaining NULL weeks to 0, matching the app's fixed behavior
update user_rankings set week = 0 where week is null;

-- Now that duplicates are gone and week is never NULL, the unique
-- constraint will correctly prevent this from happening again.
