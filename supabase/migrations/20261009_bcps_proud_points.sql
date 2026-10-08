-- Proud Points Submission App (Vanessa Deslandes + Rudy Carril, 2026-10-08).
-- Replaces the Microsoft Form "School Proud Points for Website". Mirrors the
-- banner submission app (bcps_banner_submissions): WCM submits, the District
-- Web Team approves or rejects in the same review queue, then marks it posted
-- once it is live in Finalsite, which emails the WCM.
--
-- Rules (Vanessa, 2026-10-08):
-- - A school with fewer than six points on record sends all six at once; the
--   form saves a draft until all six are complete ('initial').
-- - A school with six on record replaces one at a time ('replace'). There is
--   no separate remove step: replacing a point is the removal.
-- - Each point is a data point, a heading, a caption and a background photo.
--
-- Every table is service-role only, like the banner tables; the API routes
-- verify the caller and do all reads and writes.

create table if not exists public.bcps_proud_point_submissions (
  id uuid primary key default gen_random_uuid(),
  wcm_user_id uuid not null references auth.users(id),
  wcm_email text,
  school_location_nbr text not null references public.bcps_school_directory(loc_no),
  school_name text,
  kind text not null check (kind in ('initial', 'replace')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  -- [{slot, stat, heading, caption, photo_path, photo_name, alt_text}]
  points jsonb not null default '[]'::jsonb,
  replace_slot int check (replace_slot between 1 and 6),
  replaced_text text,
  checklist_ack jsonb,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_by_email text,
  reviewed_at timestamptz,
  rejection_email_sent_at timestamptz,
  rejection_email_error text,
  approval_email_sent_at timestamptz,
  approval_email_error text,
  notify_email_sent_at timestamptz,
  notify_email_error text,
  posted_at timestamptz,
  posted_by uuid,
  posted_by_email text,
  posted_email_sent_at timestamptz,
  posted_email_error text,
  -- Rows created from a Vercel preview build are tests (see lib/proudPoints).
  is_test boolean not null default false,
  archived_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'replace' or replace_slot is not null or replaced_text is not null)
);
create index if not exists bcps_pp_sub_school_idx on public.bcps_proud_point_submissions (school_location_nbr, status);
create index if not exists bcps_pp_sub_user_idx on public.bcps_proud_point_submissions (wcm_user_id);
-- One open draft per person per school.
create unique index if not exists bcps_pp_one_draft on public.bcps_proud_point_submissions (wcm_user_id, school_location_nbr) where status = 'draft';

-- Every background photo, checked server-side when it is attached (pixel size
-- with sharp, the banner content scan). Submit only accepts a photo that has a
-- passing row here, so the check cannot be skipped from the browser.
create table if not exists public.bcps_proud_point_photos (
  path text primary key,
  wcm_user_id uuid not null references auth.users(id),
  mime_type text,
  bytes bigint,
  width int,
  height int,
  content_scan jsonb,
  ok boolean not null default false,
  refused_reason text,
  created_at timestamptz not null default now()
);

-- The old form's submissions (eAppsHub, School Proud Points for Website.xlsx),
-- one row per point. Used to tell whether a school already has six, to show a
-- school what it sent before, and nothing else. No submitter names or emails.
create table if not exists public.bcps_proud_point_legacy (
  id bigserial primary key,
  source_row int not null,
  school_name text not null,
  school_location_nbr text references public.bcps_school_directory(loc_no),
  slot int not null,
  text text not null,
  submitted_at timestamptz,
  date_posted date,
  unique (source_row, slot)
);
create index if not exists bcps_pp_legacy_school_idx on public.bcps_proud_point_legacy (school_location_nbr);

-- Ideas gallery: past points, grouped by theme, labeled only by school level.
-- The District Web Team can hide any idea from the gallery.
create table if not exists public.bcps_proud_point_ideas (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  school_level text not null,
  text text not null unique,
  sort int not null default 0,
  hidden boolean not null default false,
  hidden_by_email text,
  created_at timestamptz not null default now()
);

-- District Web Team override when the record is wrong about whether a school
-- already shows six points (the old sheet is incomplete for some schools).
create table if not exists public.bcps_proud_point_schools (
  loc_no text primary key references public.bcps_school_directory(loc_no),
  has_six boolean not null,
  set_by_email text,
  updated_at timestamptz not null default now()
);

alter table public.bcps_proud_point_submissions enable row level security;
alter table public.bcps_proud_point_photos enable row level security;
alter table public.bcps_proud_point_legacy enable row level security;
alter table public.bcps_proud_point_ideas enable row level security;
alter table public.bcps_proud_point_schools enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bcps_proud_point_submissions','bcps_proud_point_photos','bcps_proud_point_legacy','bcps_proud_point_ideas','bcps_proud_point_schools'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_service_role_only') then
      execute format('create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t || '_service_role_only', t);
    end if;
  end loop;
end $$;

-- Pages. Both public like banner-submissions: every signed-in member can open
-- them; the review tools inside are gated on bcps_banner_admins.
insert into public.acl_objects (brand, kind, slug, title, visibility, section)
select 'bcps', 'page', v.slug, v.title, 'public', 'documents'
from (values ('proud-points', 'Proud Points'), ('my-submissions', 'Your Submissions')) as v(slug, title)
where not exists (select 1 from public.acl_objects a where a.slug = v.slug);
