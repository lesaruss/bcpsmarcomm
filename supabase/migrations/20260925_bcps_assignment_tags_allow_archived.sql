-- Web Team Assignments: allow an Archived status (Sean, 2026-09-25).
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-09-25.
ALTER TABLE public.bcps_assignment_tags DROP CONSTRAINT bcps_assignment_tags_status_check;
ALTER TABLE public.bcps_assignment_tags ADD CONSTRAINT bcps_assignment_tags_status_check
  CHECK (status = ANY (ARRAY['in-progress'::text, 'pending'::text, 'ongoing'::text, 'completed'::text, 'archived'::text]));
