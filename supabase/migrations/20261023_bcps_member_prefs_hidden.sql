-- Hidden My Resources tiles (Sean, 2026-10-23: "we should have a hide button
-- so they can hide those items"). Tile keys, same shape as tool_stars, saved
-- per account; null or [] means nothing hidden. "Show hidden" on the page
-- brings them back to unhide.
alter table public.bcps_member_prefs add column if not exists tool_hidden jsonb;
