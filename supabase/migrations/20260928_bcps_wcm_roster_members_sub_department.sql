-- WCM Roster: sub-department under each WCM's name (Sean, 2026-09-28 OOC huddle).
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-09-28.
ALTER TABLE public.bcps_wcm_roster_members ADD COLUMN IF NOT EXISTS sub_department text;
COMMENT ON COLUMN public.bcps_wcm_roster_members.sub_department IS 'Area within the department this WCM covers (e.g. Library Media Services). Null means they cover the whole department. Sean, 2026-09-28.';
