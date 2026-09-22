-- Campaign tracking for BCPS Marcom Analytics.
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-22.
-- Committed so the schema change is reviewable in the repo, not only live.
--
-- A campaign is a named push (Referendum 2026, Open Enrollment, ...) that
-- Marcomm shares a link for and then needs three numbers against: unique
-- visitors, page views, and average time on page.
--
-- page_paths is an ARRAY on purpose. browardschools.com/referendum2026 is a
-- Finalsite vanity alias whose canonical page is
-- /school-board/referendum-2026, and GA4 only ever recorded the canonical
-- path. A campaign matching one path would have reported a silent zero.
create table if not exists public.bcps_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  page_paths       text[] not null default '{}',
  primary_url      text,
  description      text,
  owner            text,
  status           text not null default 'active' check (status in ('active','archived')),
  start_date       date,
  end_date         date,
  include_subpages boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists bcps_campaigns_status_idx on public.bcps_campaigns (status, sort_order, name);

-- One row per campaign per GA4 period (YYYY-MM).
--
-- engagement_seconds and page_views are both stored raw so avg_time_seconds
-- is always recomputable from its own components rather than being a number
-- nobody can re-derive.
create table if not exists public.bcps_campaign_analytics (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.bcps_campaigns(id) on delete cascade,
  period              text not null,
  unique_visitors     integer,
  page_views          integer,
  avg_time_seconds    numeric,
  sessions            integer,
  engagement_seconds  numeric,
  pages               jsonb not null default '[]'::jsonb,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (campaign_id, period)
);

create index if not exists bcps_campaign_analytics_lookup_idx
  on public.bcps_campaign_analytics (campaign_id, period desc);

alter table public.bcps_campaigns          enable row level security;
alter table public.bcps_campaign_analytics enable row level security;

-- Gated on the same check that already guards the analytics data these rows
-- belong to: acl_member_roles.role = 'superadmin' for brand 'bcps', which is
-- what requireBcpsSuperAdmin enforces in src/lib/bcps-auth.ts and what
-- SUPERADMIN_PAGES puts on the Analytics page itself. Per
-- canon-gate-new-surfaces-on-the-same-check, named here rather than
-- re-derived. The service role bypasses RLS, so the GA4 sync is unaffected.
create policy bcps_campaigns_superadmin_read on public.bcps_campaigns
  for select to authenticated
  using (exists (
    select 1 from public.acl_member_roles r
    where r.user_id = auth.uid() and r.brand = 'bcps' and r.role = 'superadmin'
  ));

create policy bcps_campaign_analytics_superadmin_read on public.bcps_campaign_analytics
  for select to authenticated
  using (exists (
    select 1 from public.acl_member_roles r
    where r.user_id = auth.uid() and r.brand = 'bcps' and r.role = 'superadmin'
  ));
