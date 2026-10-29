-- Campaign reports need a BCPS MarComm sign-in (Sean, 2026-10-29).
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-10-29.
--
-- Comment only: is_public keeps its name and values, but it now means "every
-- signed-in user" rather than "anyone with the link". The sign-in itself is
-- enforced in src/middleware.ts and src/app/campaigns/[slug]/page.tsx.
comment on column public.bcps_campaigns.is_public is
  'true = any user signed in to BCPS MarComm can read the report; false = restricted to BCPS admins, the campaign-reports group and direct grants (checkCampaignReportAccess). Every report requires a sign-in since 2026-10-29.';
