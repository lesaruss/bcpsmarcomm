-- WCMs report their audit fixes back (Sean, 2026-10-20, after the Hot Lab
-- with Patricia Sapp: she fixed her headings in Finalsite and nothing told
-- the Office of Communications). In the department audit each red (fix) or
-- amber (review) item on a page's latest audit can be marked done, with an
-- optional note. When every item is done, the WCM requests a re-audit: the
-- department's current round records the submission (wcm_submitted_at/by),
-- the department turns WCM: Submitted, and a full-site audit is queued.
-- Marks belong to one audit result, so a re-audit starts clean: anything
-- still failing comes back unmarked.
--
-- Service-role only (RLS on, no policies): /api/bcps/site-audit actions
-- mark and submit, for the department's WCM and the District Web Team.
create table if not exists public.bcps_audit_check_marks (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.bcps_departments(id) on delete cascade,
  result_id uuid not null references public.bcps_audit_results(id) on delete cascade,
  check_id text not null,
  note text,
  marked_by text not null,
  marked_at timestamptz not null default now(),
  unique (result_id, check_id)
);
create index if not exists bcps_audit_check_marks_dept on public.bcps_audit_check_marks (department_id);
alter table public.bcps_audit_check_marks enable row level security;
