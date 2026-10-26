-- Top Pages tab on the Analytics page: the 200 most visited individual pages
-- for the period, ungrouped, written by bcps-ga4-sync (v25).
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-10-26.
--
-- Default '[]' so existing snapshots read as "no page data yet" until the
-- next sync rather than null.
alter table public.bcps_analytics_snapshots
  add column if not exists top_pages jsonb not null default '[]'::jsonb;

comment on column public.bcps_analytics_snapshots.top_pages is
  'Top 200 pages by sessions for the period: [{path, sessions, active_users, engagement_rate, avg_session_duration}]. Written by bcps-ga4-sync.';
