-- Recurring emails (Campaigns Phase 2, V 2026-10-28): emails that go out on a
-- schedule to the right people, approved by a person by Friday 5 PM for the
-- week that follows, with each person choosing how often they get each one.
--
-- bcps_email_prefs: a person's choice per recurring email (daily, weekly,
--   every two weeks, monthly, off). No row means the email's default.
-- bcps_email_approvals: one per recurring email per week (the Monday that
--   starts it). Nothing sends for a week without an approved row.
-- bcps_email_stream_sends: one per person per email per day sent, so a send
--   run can never send the same person the same email twice in a day.
-- Service role only.
create table if not exists public.bcps_email_prefs (
  email text not null,
  stream text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly', 'off')),
  updated_at timestamptz not null default now(),
  primary key (email, stream)
);
alter table public.bcps_email_prefs enable row level security;

create table if not exists public.bcps_email_approvals (
  id uuid primary key default gen_random_uuid(),
  stream text not null,
  week_start date not null,
  status text not null default 'approved' check (status in ('approved', 'withdrawn')),
  approved_by text not null,
  approved_at timestamptz not null default now(),
  audience_count integer,
  unique (stream, week_start)
);
alter table public.bcps_email_approvals enable row level security;

create table if not exists public.bcps_email_stream_sends (
  id uuid primary key default gen_random_uuid(),
  stream text not null,
  week_start date not null,
  send_date date not null,
  email text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (stream, send_date, email)
);
create index if not exists bcps_email_stream_sends_week_idx on public.bcps_email_stream_sends (stream, week_start);
alter table public.bcps_email_stream_sends enable row level security;
