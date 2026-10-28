-- Web Team Assignments writes (2026-10-28). The page wrote bcps_assignment_tags
-- with the public anon key under "Public insert" and "Public update", so anyone
-- holding that key could rewrite the tracker; any signed-in Supabase user could
-- also delete rows. Writes now go through /api/bcps/assignment-tags (service
-- role, gated on the bcps-assignments page grant). Public read stays: the page
-- is public and renders the same data.
-- Apply only after the page that calls /api/bcps/assignment-tags is live.
drop policy if exists "Public insert" on public.bcps_assignment_tags;
drop policy if exists "Public update" on public.bcps_assignment_tags;
drop policy if exists "authenticated can delete bcps_assignment_tags" on public.bcps_assignment_tags;
