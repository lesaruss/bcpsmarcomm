-- Dead Pages tab on the Analytics page: every path that served the site's
-- 404 template in the period, with a suggested redirect target where one can
-- be inferred. Written by bcps-ga4-sync (v28).
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-10-27.
alter table public.bcps_analytics_snapshots
  add column if not exists dead_pages jsonb not null default '[]'::jsonb;

comment on column public.bcps_analytics_snapshots.dead_pages is
  'Paths that served the 404 page in the period, by sessions: [{path, name, sessions, active_users, suggested_path}]. suggested_path is a guess (same last URL segment, or / for old-site landing pages) for a person to confirm. Written by bcps-ga4-sync.';
