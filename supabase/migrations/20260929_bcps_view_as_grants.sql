-- Assignable "View as" (Sean, Hot Lab 2026-09-29, Banner Submission review with
-- Vanessa Deslandes). Until now only SuperAdmin could preview other access tiers.
-- A row here lets that person use the same sidebar "View as" switcher, limited to
-- their own tier and below (enforced in /api/bcps/my-access, never client-side).
-- SuperAdmin manages this list from Platform Management > View As Access.
-- Seeded with Vanessa. Applied to project fwbhwfxpncrsfhttimna via the Supabase
-- MCP on 2026-09-29.

CREATE TABLE IF NOT EXISTS public.bcps_view_as_grants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  granted_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Service role only: every read and write goes through API routes that verify
-- the caller first.
ALTER TABLE public.bcps_view_as_grants ENABLE ROW LEVEL SECURITY;

INSERT INTO public.bcps_view_as_grants (user_id, email, granted_by_email)
SELECT id, email, 'contact@lesaruss.com'
FROM auth.users
WHERE lower(email) = 'vanessa.deslandes@browardschools.com'
ON CONFLICT (user_id) DO NOTHING;
