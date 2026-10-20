-- Calendar Post Requests (Sean, 2026-10-20): the Wufoo "Calendar Post
-- Guidelines & Request Form" brought into bcpsmarcomm.com, so the District
-- can stop using Wufoo. Two ways in, one table:
--   /calendar-request   the form on its own (guidelines, then the request)
--   /marcomm-request    "post it on the District calendar" opens the same
--                       guidelines and fields inside the MarComm request;
--                       marcomm_request_id links the two
-- The Office of Communications tracks them in MarComm Assignments > Calendar
-- posts: new, posted (with the calendar link) or declined.
--
-- Service-role only (RLS on, no policies): /api/bcps/calendar-request-submit
-- and /api/bcps/marcomm-request-submit write, /api/bcps/calendar-requests
-- reads and updates for the marcomm-assignments page grant.
create sequence if not exists public.bcps_calendar_request_number start 1;

create table if not exists public.bcps_calendar_requests (
  id uuid primary key default gen_random_uuid(),
  request_number integer not null default nextval('public.bcps_calendar_request_number') unique,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('meeting', 'special_event', 'virtual_meeting')),
  event_name text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  virtual_link text,
  virtual_phone text,
  virtual_conference_id text,
  additional_info text,
  location text,
  address_street text,
  address_line2 text,
  city text,
  state text,
  zip text,
  website_link text,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  school_department text,
  submitter_name text not null,
  submitter_department text not null,
  submitter_phone text not null,
  guidelines_ack boolean not null default false,
  requester_email text not null,
  created_by_email text,
  marcomm_request_id uuid references public.bcps_marcomm_requests(id),
  status text not null default 'new' check (status in ('new', 'posted', 'declined')),
  posted_url text,
  status_note text,
  status_by text,
  status_at timestamptz
);
create index if not exists bcps_calendar_requests_status on public.bcps_calendar_requests (status, event_date);
alter table public.bcps_calendar_requests enable row level security;
