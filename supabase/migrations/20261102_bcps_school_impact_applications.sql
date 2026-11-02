-- Public School Impact Application widget (Sean + Glennika D. Gordon, Facility
-- Planning and Real Estate, Growth Management Section, 2026-11-02). Replaces
-- the emailed paper Form 4726 (05/24): applicants pay on the District e-store,
-- then fill in the application online and upload the payment receipt, site
-- plan and survey in one place. Staff track each application in the Widgets
-- hub editor (src/components/pages/SchoolImpactApplicationsPage.tsx).
--
-- Statuses: new (submitted, not yet checked) -> needs_info (something is
-- missing, the clock does not run) -> accepted (determined complete; the
-- 30-business-day review clock starts, per the form's note "30-Day review
-- period only commences upon a determination of completeness") ->
-- letter_sent (the SCAD letter went out, sent by staff from their own email).
--
-- Service-role only (RLS on, no policies): the public submit route
-- (/api/bcps/school-impact-application) and the ACL-gated tracker route
-- (/api/bcps/school-impact-applications) do every read and write. Rows hold
-- applicant contact details, so nothing here is readable with the anon key.

create sequence if not exists public.bcps_school_impact_seq start with 1;

create table if not exists public.bcps_school_impact_applications (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  status text not null default 'new' check (status in ('new', 'needs_info', 'accepted', 'letter_sent')),
  submitted_at timestamptz not null default now(),
  -- Applicant summary columns, for sorting, search and email; the full form is in data.
  project_name text not null,
  application_types text[] not null default '{}',
  applicant_name text not null,
  applicant_email text not null,
  applicant_phone text,
  jurisdiction text,
  payment_order_no text,
  data jsonb not null default '{}',
  -- {receipt:[{name,path,size}], site_plan:[...], survey:[...], plat_letter:[...], supporting:[...], scad_letter:[...]}
  attachments jsonb not null default '{}',
  -- Staff-only
  school_board_number text,
  staff_notes text,
  needs_info_note text,
  accepted_at timestamptz,
  due_date date,
  letter_sent_at timestamptz,
  reminder_sent_at timestamptz,
  history jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists bcps_school_impact_status_idx on public.bcps_school_impact_applications (status, due_date);
create index if not exists bcps_school_impact_email_idx on public.bcps_school_impact_applications (lower(applicant_email), submitted_at desc);

alter table public.bcps_school_impact_applications enable row level security;

-- PSIA-2026-0001 style reference numbers, atomic.
create or replace function public.bcps_school_impact_next_ref() returns text
language sql security definer set search_path = public as $$
  select 'PSIA-' || to_char(now() at time zone 'America/New_York', 'YYYY') || '-' || lpad(nextval('public.bcps_school_impact_seq')::text, 4, '0')
$$;
revoke all on function public.bcps_school_impact_next_ref() from public, anon, authenticated;

-- Private bucket for application files (uploaded through signed URLs).
insert into storage.buckets (id, name, public, file_size_limit)
values ('school-impact-applications', 'school-impact-applications', false, 52428800)
on conflict (id) do nothing;

-- Due-soon reminder: weekdays 8:23 AM Eastern (12:23 UTC in EST, 13:23 UTC
-- in EDT; 12:23 UTC is used year round, so 7:23 or 8:23 AM local). One email
-- to prm_growthmanagement@browardschools.com listing every accepted
-- application within 5 business days of its due date or overdue that has not
-- had a reminder yet.
select cron.schedule('bcps-school-impact-reminders', '23 12 * * 1-5', $c$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/school-impact-reminders',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.bcps_school_impact_applications
    where status = 'accepted' and reminder_sent_at is null and due_date is not null
      and due_date <= (now() at time zone 'America/New_York')::date + 7
  );
$c$);

-- Widgets hub registration. Applied once the embed is live on production.
insert into public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
select 'school-impact-application', 'Public School Impact Application',
  'Growth Management intake for Public School Impact Applications (Form 4726): applicants pay on the e-store, fill in the application and upload the receipt, site plan and survey. Staff track each one to the SCAD letter.',
  '/embeds/school-impact-application.html', 'school-impact-application', 7
where not exists (select 1 from public.bcps_widgets where slug = 'school-impact-application');
insert into public.acl_objects (brand, kind, slug, title, visibility)
select 'bcps', 'page', 'school-impact-application', 'Public School Impact Application', 'restricted'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'page' and slug = 'school-impact-application');
