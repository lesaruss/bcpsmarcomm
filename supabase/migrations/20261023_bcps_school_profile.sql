-- School Profile (Sean + Vanessa Deslandes, 2026-10-23): one page per school,
-- modeled on the department profile. Two stores it needs that no table held:
--
-- bcps_school_contacts: the school's leadership for the profile's Leadership
-- panel (principal, School Board member). One row per location number,
-- filled in by the District Web Team from the profile.
--
-- bcps_school_activity: the school's record of what the District Web Team
-- did with it, starting with notes sent to the school's WCM from the profile,
-- so the team keeps its record here instead of only in IncidentIQ. The
-- profile's Activity report merges these with audits, banners and Proud
-- Points.
--
-- Service role only; /api/bcps/school-profile decides who reads and writes.
create table if not exists public.bcps_school_contacts (
  loc_no text primary key,
  principal_name text,
  principal_email text,
  board_member_name text,
  board_district text,
  updated_by_email text,
  updated_at timestamptz not null default now()
);
alter table public.bcps_school_contacts enable row level security;

create table if not exists public.bcps_school_activity (
  id uuid primary key default gen_random_uuid(),
  loc_no text not null,
  kind text not null default 'note',
  actor_email text,
  subject text,
  body text,
  sent_to text,
  email_sent boolean,
  email_error text,
  created_at timestamptz not null default now()
);
create index if not exists bcps_school_activity_loc_idx on public.bcps_school_activity (loc_no, created_at desc);
alter table public.bcps_school_activity enable row level security;
