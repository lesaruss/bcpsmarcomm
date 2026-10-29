-- Certification follow-up (Sean, 2026-10-29): one row per email sent, with a
-- random token used by the open pixel (/api/t/o/<token>) and the tracked link
-- (/api/t/c/<token>), so the follow-up page can show who opened and who
-- clicked. Service role only; nothing public reads it.
CREATE TABLE IF NOT EXISTS public.bcps_email_tracking (
  token text PRIMARY KEY,
  outbound_id uuid,
  campaign text NOT NULL,
  email text NOT NULL,
  group_key text,
  pct_at_send integer,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  last_user_agent text
);
CREATE INDEX IF NOT EXISTS bcps_email_tracking_campaign_idx ON public.bcps_email_tracking (campaign, email);
ALTER TABLE public.bcps_email_tracking ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bcps_email_tracking FROM anon, authenticated;

-- Last time each person worked in the certification course.
CREATE OR REPLACE VIEW public.bcps_cert_last_activity AS
SELECT user_id, max(greatest(last_visited_at, completed_at)) AS last_active
FROM public.wcm_cert_progress GROUP BY user_id;
REVOKE ALL ON public.bcps_cert_last_activity FROM anon, authenticated;
