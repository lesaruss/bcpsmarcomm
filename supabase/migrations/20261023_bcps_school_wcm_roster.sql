-- School WCM roster (Sean + Vanessa Deslandes, 2026-10-23): every school's
-- WCMs from the BCPS Central "WCM List" export, uploaded from the Schools tab
-- (/api/bcps/school-wcm-roster) and upserted by P-number. Every WCM on it
-- gets their school's dashboard, certified or not. Service role only.
create table if not exists public.bcps_school_wcm_roster (
  p_number text primary key,
  loc_no text not null,
  central_location text,
  full_name text,
  email text,
  cert_status text,
  site_access text,
  enrolled_on date,
  cert_due_on date,
  designated_by text,
  designated_on date,
  access_start date,
  access_end date,
  imported_at timestamptz not null default now()
);
create index if not exists bcps_school_wcm_roster_loc_idx on public.bcps_school_wcm_roster (loc_no);
create index if not exists bcps_school_wcm_roster_email_idx on public.bcps_school_wcm_roster (email);
alter table public.bcps_school_wcm_roster enable row level security;
