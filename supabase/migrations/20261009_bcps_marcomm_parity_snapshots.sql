-- MarComm Assignments parity with Web Team Assignments (Sean, 2026-10-09):
-- priority (H/M/L), start date, ongoing, overdue dismissal and a working link
-- per request; notes record where they came from (typed, dictated, or a
-- meeting transcript); and dated snapshots so anyone can view the tracker
-- "as of" any meeting.
alter table public.bcps_marcomm_requests
  add column if not exists priority text check (priority in ('high', 'medium', 'low')),
  add column if not exists start_date date,
  add column if not exists is_ongoing boolean not null default false,
  add column if not exists overdue_dismissed boolean not null default false,
  add column if not exists link_url text;

alter table public.bcps_marcomm_request_notes
  add column if not exists source text not null default 'typed' check (source in ('typed', 'dictated', 'meeting', 'system')),
  add column if not exists meeting_label text;

-- One row per meeting (or manual save): the whole tracker as it stood, so
-- "View as of" can show any past version read-only.
create table if not exists public.bcps_marcomm_snapshots (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  label text not null,
  summary text,
  source text not null default 'manual' check (source in ('manual', 'transcript', 'import')),
  data jsonb not null,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists bcps_marcomm_snapshots_date_idx on public.bcps_marcomm_snapshots (meeting_date desc, created_at desc);
alter table public.bcps_marcomm_snapshots enable row level security;

-- Saves the whole tracker as it stands now under a meeting date.
create or replace function public.bcps_marcomm_take_snapshot(p_meeting_date date, p_label text, p_summary text, p_source text, p_created_by text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into bcps_marcomm_snapshots (meeting_date, label, summary, source, created_by, data)
  select p_meeting_date, p_label, p_summary, coalesce(p_source, 'manual'), p_created_by,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'job_number', r.job_number, 'source', r.source, 'title', r.title,
      'requester_name', r.requester_name, 'org_name', r.org_name, 'services', r.services,
      'lead', r.lead, 'support', r.support, 'status', r.status, 'priority', r.priority,
      'date_needed', r.date_needed, 'start_date', r.start_date, 'is_ongoing', r.is_ongoing,
      'submitted_at', r.submitted_at, 'completed_at', r.completed_at,
      'note_count', (select count(*) from bcps_marcomm_request_notes n where n.request_id = r.id and n.created_at <= now())
    ) order by r.submitted_at desc), '[]'::jsonb)
  from bcps_marcomm_requests r
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.bcps_marcomm_take_snapshot(date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bcps_marcomm_take_snapshot(date, text, text, text, text) to service_role;
