-- Web Team Assignments notes are internal (2026-10-22). They were readable
-- and writable by anyone holding the public anon key ("Public read",
-- "Public insert") and deletable by any signed-in account. Every reader and
-- writer now goes through /api/bcps/assignment-notes, gated on the
-- bcps-assignments page grant, using the service role. Client roles have no
-- policy left; the service role bypasses RLS anyway.
-- Applied as ALTER POLICY ... TO service_role (the policies stay, scoped to
-- the server only) because drops wait on a separate approval; the effect for
-- anon and signed-in clients is the same: no access.
alter policy "Public read" on public.bcps_assignment_notes to service_role;
alter policy "Public insert" on public.bcps_assignment_notes to service_role;
alter policy "authenticated can delete bcps_assignment_notes" on public.bcps_assignment_notes to service_role;
alter table public.bcps_assignment_notes enable row level security;
