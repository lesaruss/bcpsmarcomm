-- Banner Submissions "Mark as posted" (Sean + Vanessa Deslandes, 2026-09-29).
-- Approved uploads the District Web Team has actually put on the school site.
-- Approved + posted_at null = ready to post. Set/cleared via /api/banner/review.
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-09-29.
ALTER TABLE public.bcps_banner_submissions
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid,
  ADD COLUMN IF NOT EXISTS posted_by_email text;
