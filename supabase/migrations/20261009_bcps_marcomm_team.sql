-- MarComm Assignments team roster (Sean, 2026-10-08): the people and teams a
-- request can be assigned to, taken from the weekly Marcomm Meeting invite.
-- Lead and Support on bcps_marcomm_requests hold these display names, so the
-- page can offer dropdowns and a "My items" view instead of free-text initials.
-- Rows carry employee names and emails, so they are seeded in the database
-- only, never in this public repo. Service role only (RLS on, no policies).
create table if not exists public.bcps_marcomm_team (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  email text,
  initials text,
  kind text not null default 'person' check (kind in ('person', 'team')),
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.bcps_marcomm_team enable row level security;
