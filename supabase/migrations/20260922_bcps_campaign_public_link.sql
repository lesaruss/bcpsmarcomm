-- Per-campaign public sharing for /campaigns/[slug].
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-22.
--
-- Sean: "let's just make that public... we may need to share it with the chief
-- and a whole bunch of other people. And I don't want to create any
-- unnecessary obstacles."
--
-- Deliberately a PER-CAMPAIGN flag rather than opening the whole route. A
-- campaign report is aggregate traffic about an already-public District web
-- page, so sharing one is low risk - but "all campaign reports are public
-- forever" is a different and much larger promise than "this one is." The flag
-- keeps the decision per report and reversible in one row.
--
-- Default TRUE because that is the behaviour Sean asked for: a new campaign is
-- shareable without anyone having to remember to unlock it. Any campaign that
-- should not be shared is set false and falls back to the existing default-deny
-- gate (BCPS admins, Office of Communications, named individuals).
--
-- Public still means unlisted, not indexed: the route sends robots noindex.
alter table public.bcps_campaigns
  add column if not exists is_public boolean not null default true;

comment on column public.bcps_campaigns.is_public is
  'true = anyone with the /campaigns/<slug> link can view, no sign-in. false = falls back to checkCampaignReportAccess (admins, OOC group, direct grants). Per-campaign on purpose; see src/lib/bcps-campaign-access.ts.';

update public.bcps_campaigns set is_public = true where slug = 'referendum-2026';
