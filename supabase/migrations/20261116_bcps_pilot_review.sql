-- WCM Pilot Review (Sean, 2026-11-16). Fifteen school WCMs test the WCM
-- Dashboard, Banner Submission and Proud Points Submission before launch,
-- then fill in the feedback form at /pilot-review. Both tables are
-- server-only: /api/bcps/pilot-review reads and writes them with the service
-- key, so RLS is on with no policies and anon/authenticated hold no grants.
-- Schools and locations follow Sean's pilot list, matched to
-- bcps_school_assignments (the roster had Gessy Sainvilus at 3221, Charles
-- Drew; the pilot list says Pinewood, 2811).

create table if not exists public.bcps_pilot_review_members (
  email       text primary key,
  full_name   text not null,
  school_name text not null,
  loc_no      text,
  lead_name   text not null,
  lead_email  text not null,
  cohort      text not null default 'school-wcm-2026-11',
  created_at  timestamptz not null default now()
);

create table if not exists public.bcps_pilot_review_responses (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  email           text not null,
  user_id         uuid,
  full_name       text not null,
  school_name     text not null,
  is_pilot_member boolean not null default false,
  overall_rating  smallint check (overall_rating between 1 and 5),
  launch_ready    text check (launch_ready in ('yes', 'after_fixes', 'not_yet')),
  follow_up_ok    boolean not null default false,
  answers         jsonb not null default '{}'::jsonb
);
create index if not exists bcps_pilot_review_responses_email_idx on public.bcps_pilot_review_responses (lower(email));

alter table public.bcps_pilot_review_members enable row level security;
alter table public.bcps_pilot_review_responses enable row level security;
revoke all on public.bcps_pilot_review_members from anon, authenticated;
revoke all on public.bcps_pilot_review_responses from anon, authenticated;

insert into public.bcps_pilot_review_members (email, full_name, school_name, loc_no, lead_name, lead_email) values
  ('lauren.martino@browardschools.com',   'Lauren Martino',   'Driftwood Middle',          '0861', 'Rudy Carril',        'rudy.carril@browardschools.com'),
  ('stephanie.suraci@browardschools.com', 'Stephanie Suraci', 'Lauderhill 6-12 STEM-MED',  '1391', 'Rudy Carril',        'rudy.carril@browardschools.com'),
  ('michelle.lutin@browardschools.com',   'Michelle Lutin',   'Tropical Elementary',       '0731', 'Rudy Carril',        'rudy.carril@browardschools.com'),
  ('caryncuadra@browardschools.com',      'Caryn Cuadra',     'Country Hills Elementary',  '3111', 'Andrea Barton',      'andrea.barton@browardschools.com'),
  ('fritz.mama@browardschools.com',       'Fritz Mama',       'Morrow Elementary',         '2691', 'Andrea Barton',      'andrea.barton@browardschools.com'),
  ('andrea.keery@browardschools.com',     'Andrea Keery',     'Westglades Middle',         '3871', 'Andrea Barton',      'andrea.barton@browardschools.com'),
  ('dawnmichaud@browardschools.com',      'Dawn Michaud',     'Pasadena Lakes Elementary', '2071',   'Jeune Tilus',        'jeune.tilus@browardschools.com'),
  ('rosa.i.santiago@browardschools.com',  'Rosa Santiago',    'Dillard Elementary',        '0271', 'Jeune Tilus',        'jeune.tilus@browardschools.com'),
  ('sarah.clark@browardschools.com',      'Sarah Clark',      'Forest Hills Elementary',   '2631', 'Jeune Tilus',        'jeune.tilus@browardschools.com'),
  ('darrylp.klein@browardschools.com',    'Darryl Klein',     'Norcrest Elementary',       '0561',   'Nakesha Ali-Sirju',  'nakesha.ali-sirju@browardschools.com'),
  ('kim.morelli@browardschools.com',      'Kim Morelli',      'Coral Park Elementary',     '3041', 'Nakesha Ali-Sirju',  'nakesha.ali-sirju@browardschools.com'),
  ('matthew.winans@browardschools.com',   'Matthew Winans',   'Marjory Stoneman Douglas High', '3011', 'Nakesha Ali-Sirju',  'nakesha.ali-sirju@browardschools.com'),
  ('dani.kim@browardschools.com',         'Dani Kim',         'Bennett Elementary',        '0201', 'Vanessa Deslandes',  'vanessa.deslandes@browardschools.com'),
  ('cathy.delrio@browardschools.com',     'Cathy Del Rio',    'Dolphin Bay Elementary',    '3751',   'Vanessa Deslandes',  'vanessa.deslandes@browardschools.com'),
  ('gessy.sainvilus@browardschools.com',  'Gessy Sainvilus',  'Pinewood Elementary',       '2811', 'Vanessa Deslandes',  'vanessa.deslandes@browardschools.com')
on conflict (email) do nothing;
