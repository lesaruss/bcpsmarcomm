-- Downloads, video plays and outbound link clicks for BCPS Marcom Analytics.
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-10-29.
--
-- Sean, 2026-10-29, after Iviani asked for the Referendum 2026 one-pager,
-- toolkit and video numbers: "I want it added for all pages. That's something
-- we've always wanted to track." Written by bcps-ga4-sync v38 for the whole
-- site (the snapshot) and for every campaign, from GA4's enhanced measurement
-- events (file_download, outbound click, video_start/progress/complete).
--
-- Shape: { downloads: [{ name, extension, url, page, count, people }],
--          videos:    [{ title, url, page, starts, progress, completes, people }],
--          links:     [{ url, domain, page, count, people }] }
-- count/starts are additive across rows; people is de-duplicated within a
-- row only and must never be summed.
--
-- NULL means not yet synced since v38 (or the lookup failed and the previous
-- value was kept), which the UI says plainly rather than showing a zero.
alter table public.bcps_analytics_snapshots
  add column if not exists interactions jsonb;

alter table public.bcps_campaign_analytics
  add column if not exists interactions jsonb;

comment on column public.bcps_analytics_snapshots.interactions is
  'Whole-site downloads, video plays and outbound link clicks for the period (bcps-ga4-sync v38). See migration 20261029_bcps_interactions.';
comment on column public.bcps_campaign_analytics.interactions is
  'Downloads, video plays and outbound link clicks on the campaign pages for its window (bcps-ga4-sync v38). See migration 20261029_bcps_interactions.';
