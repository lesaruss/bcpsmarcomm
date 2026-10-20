-- MarComm Assignments and Request Form updates (Sean, 2026-10-20, from the
-- Marketing meeting and Jennifer Hodder's form review).
--
-- 1. Did they already submit the Calendar Request Form? The old Wufoo form
--    asked it; the team should not have to file the calendar request for
--    them. null = not asked (no calendar needed, or an older request).
alter table public.bcps_marcomm_requests add column if not exists calendar_form_submitted boolean;

-- 2. Combine records: a duplicate is folded into the request that stays. Its
--    notes and attachments move over, and it leaves the tracker; the row is
--    kept (never deleted) with merged_into pointing at the one that stays.
alter table public.bcps_marcomm_requests add column if not exists merged_into uuid references public.bcps_marcomm_requests(id);
alter table public.bcps_marcomm_requests add column if not exists merged_at timestamptz;
alter table public.bcps_marcomm_requests add column if not exists merged_by text;

-- 3. Edit notes: typed and dictated notes can be corrected; the note shows it
--    was edited, and when and by whom.
alter table public.bcps_marcomm_request_notes add column if not exists edited_at timestamptz;
alter table public.bcps_marcomm_request_notes add column if not exists edited_by text;

-- Meeting snapshots leave combined duplicates out, like the live tracker.
create or replace function public.bcps_marcomm_take_snapshot(p_meeting_date date, p_label text, p_summary text, p_source text, p_created_by text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  where r.merged_into is null
  returning id into v_id;
  return v_id;
end $function$;
