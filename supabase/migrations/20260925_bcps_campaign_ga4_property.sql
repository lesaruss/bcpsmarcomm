-- Per-campaign GA4 property for BCPS Marcom campaign reports.
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-25.
--
-- Until now every campaign read GA4 property 527326342 (browardschools.com),
-- hardcoded in bcps-ga4-sync. browardschools.ai ("Broward Powered by AI")
-- reports to its OWN property under the District's separate Browardschools.com
-- Analytics account (2096321), measurement ID G-2FREMYSFP4, so a campaign for
-- it has to name that property or it would silently report browardschools.com
-- homepage traffic under the wrong name.
--
-- NULL means the District default (527326342), so every existing campaign,
-- Referendum 2026 included, keeps reading exactly what it read before.
alter table public.bcps_campaigns
  add column if not exists ga4_property_id text;

alter table public.bcps_campaigns
  drop constraint if exists bcps_campaigns_ga4_property_id_numeric;
alter table public.bcps_campaigns
  add constraint bcps_campaigns_ga4_property_id_numeric
  check (ga4_property_id is null or ga4_property_id ~ '^[0-9]+$');

comment on column public.bcps_campaigns.ga4_property_id is
  'Numeric GA4 property ID this campaign reads (not the G- measurement ID). NULL = District default 527326342 (browardschools.com). The sync service account needs Viewer on any property named here.';
