-- Per-campaign switch for the Pages tab on /campaigns/[slug].
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-25.
--
-- Sean, 2026-09-25, on the BrowardSchools.ai report: hide the Pages tab for
-- now. That site is one page whose sections only started being counted
-- separately on 2026-09-25, so its Pages tab was a single "/" row that would
-- raise more questions than it answered. Rundown, Traffic, and Sources &
-- Devices stay.
--
-- Default TRUE so every existing report, Referendum 2026 included, keeps the
-- tab. Turn it back on for browardschools-ai once section data has built up.
alter table public.bcps_campaigns
  add column if not exists show_pages_tab boolean not null default true;

comment on column public.bcps_campaigns.show_pages_tab is
  'false hides the Pages tab on the campaign report. Per campaign; default true.';

update public.bcps_campaigns set show_pages_tab = false where slug = 'browardschools-ai';
