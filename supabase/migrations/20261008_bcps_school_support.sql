-- School support leads (Vanessa + Sean, 2026-10-08). Each school has one
-- District Web Team support lead for 2026-27 (playbook doc
-- bcps-school-assignments-2026-27). These tables back the public "Find your
-- support lead" embed on the Finalsite WCM page: a school WCM searches their
-- school and sees their lead's photo, bio, an IIQ ticket link and the Hot
-- Lab times. Public read (the embed uses the anon key, like the other
-- directory embeds); writes only through the service role.

create table if not exists public.bcps_support_leads (
  email       text primary key,
  full_name   text not null,
  title       text,
  bio         text check (bio is null or char_length(bio) <= 600),
  photo_url   text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists public.bcps_school_assignments (
  loc_no        text primary key,
  school_name   text not null,
  display_name  text not null,
  school_level  text,
  region        text,
  lead_email    text not null references public.bcps_support_leads(email) on update cascade,
  no_wcm        boolean not null default false,
  school_year   text not null default '2026-27',
  updated_at    timestamptz not null default now()
);
create index if not exists bcps_school_assignments_lead_idx on public.bcps_school_assignments (lead_email);

create table if not exists public.bcps_support_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.bcps_support_leads enable row level security;
alter table public.bcps_school_assignments enable row level security;
alter table public.bcps_support_settings enable row level security;
drop policy if exists "public read" on public.bcps_support_leads;
drop policy if exists "public read" on public.bcps_school_assignments;
drop policy if exists "public read" on public.bcps_support_settings;
create policy "public read" on public.bcps_support_leads for select to anon, authenticated using (active);
create policy "public read" on public.bcps_school_assignments for select to anon, authenticated using (true);
create policy "public read" on public.bcps_support_settings for select to anon, authenticated using (true);
