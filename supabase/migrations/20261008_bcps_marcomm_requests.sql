-- MarComm Assignments (Sean, 2026-10-08): the Office of Communications request
-- tracker, modeled on Web Team Assignments, replacing the MarComm Spreadsheet
-- and fed by a request form District employees fill in while signed in.
--
-- Service-role only (RLS on, no policies): every read and write goes through
-- /api/bcps/marcomm-requests and /api/bcps/marcomm-request-submit, which gate on
-- the 'marcomm-assignments' page grant and on a signed-in District account.
-- Rows hold employee contact details, so nothing here is readable with the anon key.

create table if not exists public.bcps_marcomm_requests (
  id uuid primary key default gen_random_uuid(),
  -- Continues the Wufoo job numbers (last Wufoo entry was #1743).
  job_number integer unique,
  source text not null default 'form' check (source in ('form', 'wufoo', 'internal')),
  title text not null,
  requester_name text,
  requester_title text,
  requester_email text,
  requester_phone text,
  org_type text check (org_type in ('School', 'Department')),
  org_name text,
  services text[] not null default '{}',
  audiences text[] not null default '{}',
  description text,
  goal text,
  date_needed date,
  event_date date,
  is_becon boolean not null default false,
  calendar_needed boolean not null default false,
  attachments jsonb not null default '[]',
  lead text,
  support text,
  status text not null default 'new'
    check (status in ('new', 'needs_info', 'assigned', 'in_progress', 'in_review', 'scheduled', 'on_hold', 'completed', 'declined')),
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by_email text,
  updated_at timestamptz not null default now()
);

create sequence if not exists public.bcps_marcomm_job_seq start with 1744;

create table if not exists public.bcps_marcomm_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.bcps_marcomm_requests(id) on delete cascade,
  body text not null,
  author text,
  created_at timestamptz not null default now()
);

create index if not exists bcps_marcomm_requests_status_idx on public.bcps_marcomm_requests (status);
create index if not exists bcps_marcomm_request_notes_req_idx on public.bcps_marcomm_request_notes (request_id, created_at desc);

alter table public.bcps_marcomm_requests enable row level security;
alter table public.bcps_marcomm_request_notes enable row level security;

-- Atomic next job number for form submissions.
create or replace function public.bcps_marcomm_next_job() returns integer
language sql security definer set search_path = public as $$
  select nextval('public.bcps_marcomm_job_seq')::integer
$$;
revoke all on function public.bcps_marcomm_next_job() from public, anon, authenticated;

-- Private bucket for request attachments (uploaded through signed URLs).
insert into storage.buckets (id, name, public, file_size_limit)
values ('marcomm-attachments', 'marcomm-attachments', false, 26214400)
on conflict (id) do nothing;
