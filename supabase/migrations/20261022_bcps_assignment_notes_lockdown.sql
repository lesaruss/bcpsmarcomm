-- Web Team Assignments notes are internal (2026-10-22). They were readable
-- and writable by anyone holding the public anon key ("Public read",
-- "Public insert") and deletable by any signed-in account. Every reader and
-- writer now goes through /api/bcps/assignment-notes, gated on the
-- bcps-assignments page grant, using the service role. No client policies
-- remain; the service role bypasses RLS.
drop policy if exists "Public read" on public.bcps_assignment_notes;
drop policy if exists "Public insert" on public.bcps_assignment_notes;
drop policy if exists "authenticated can delete bcps_assignment_notes" on public.bcps_assignment_notes;
alter table public.bcps_assignment_notes enable row level security;
