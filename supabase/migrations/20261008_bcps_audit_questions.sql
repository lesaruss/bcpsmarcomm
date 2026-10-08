-- Audit question bank (Sean, 2026-10-08). A WCM stuck on an audit or ADA
-- item asks from the item itself; the District Web Team answers here.
-- Answers show under that item for every WCM, and repeat questions point to
-- what needs a Hot Lab or a clearer write-up. Read and written only through
-- /api/bcps/audit-questions (service role); RLS on with no policies.
create table if not exists public.bcps_audit_questions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  asked_by      text not null,
  department_id uuid references public.bcps_departments(id) on delete set null,
  school_id     uuid references public.bcps_schools(id) on delete set null,
  result_id     uuid references public.bcps_audit_results(id) on delete set null,
  page_url      text,
  check_id      text not null,
  check_title   text not null,
  question      text not null check (char_length(question) between 3 and 2000),
  status        text not null default 'open' check (status in ('open', 'answered', 'closed')),
  answer        text,
  answered_by   text,
  answered_at   timestamptz,
  shared        boolean not null default true
);
create index if not exists bcps_audit_questions_check_idx on public.bcps_audit_questions (check_id, status);
create index if not exists bcps_audit_questions_status_idx on public.bcps_audit_questions (status, created_at desc);
alter table public.bcps_audit_questions enable row level security;
