-- Applies what was decided in a recorded Marcomm Meeting (Sean, 2026-10-09).
-- The transcript is read (by Claude, under the same rule as Web Team
-- Assignments: canon-bcps-web-team-assignments-meeting-updates) into a JSON
-- payload; this applies it in one transaction, writes a dated note on every
-- row it touches naming the meeting, then saves a snapshot dated to the
-- meeting so "View as of" can show the tracker before and after.
--
-- payload: {
--   "meeting_date": "2026-10-14", "meeting_label": "Oct 14 Marcomm Meeting",
--   "summary": "...",
--   "changes": [{ "job_number": 1744 | "id": "<uuid>", "status"?, "lead"?,
--                 "support"?, "date_needed"?, "priority"?, "note": "..." }],
--   "new_items": [{ "title": "...", "description"?, "lead"?, "support"?,
--                   "date_needed"?, "priority"?, "note"? }]
-- }
create or replace function public.bcps_marcomm_apply_meeting_update(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_date date := (payload->>'meeting_date')::date;
  v_label text := coalesce(nullif(payload->>'meeting_label', ''), 'Marcomm Meeting');
  c jsonb; v_id uuid; v_changed int := 0; v_added int := 0; v_snap uuid; v_note text;
begin
  if v_date is null then raise exception 'meeting_date is required'; end if;

  for c in select * from jsonb_array_elements(coalesce(payload->'changes', '[]'::jsonb)) loop
    select id into v_id from bcps_marcomm_requests
      where id = nullif(c->>'id', '')::uuid or (c ? 'job_number' and job_number = (c->>'job_number')::int) limit 1;
    if v_id is null then continue; end if;
    update bcps_marcomm_requests set
      status = coalesce(c->>'status', status),
      completed_at = case when c ? 'status' then (case when c->>'status' in ('completed', 'declined') then coalesce(completed_at, now()) else null end) else completed_at end,
      lead = case when c ? 'lead' then nullif(c->>'lead', '') else lead end,
      support = case when c ? 'support' then nullif(c->>'support', '') else support end,
      date_needed = case when c ? 'date_needed' then nullif(c->>'date_needed', '')::date else date_needed end,
      overdue_dismissed = case when c ? 'date_needed' then false else overdue_dismissed end,
      priority = case when c ? 'priority' then nullif(c->>'priority', '') else priority end,
      updated_at = now()
    where id = v_id;
    v_note := coalesce(nullif(c->>'note', ''), 'Updated in the meeting.');
    insert into bcps_marcomm_request_notes (request_id, body, author, source, meeting_label)
      values (v_id, v_note, 'From the ' || v_label, 'meeting', v_label);
    v_changed := v_changed + 1;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(payload->'new_items', '[]'::jsonb)) loop
    insert into bcps_marcomm_requests (source, title, description, lead, support, date_needed, priority, status, created_by_email)
      values ('internal', left(c->>'title', 200), nullif(c->>'description', ''), nullif(c->>'lead', ''), nullif(c->>'support', ''),
              nullif(c->>'date_needed', '')::date, nullif(c->>'priority', ''),
              case when nullif(c->>'lead', '') is not null then 'assigned' else 'new' end, 'From the ' || v_label)
      returning id into v_id;
    insert into bcps_marcomm_request_notes (request_id, body, author, source, meeting_label)
      values (v_id, coalesce(nullif(c->>'note', ''), 'Added in the meeting.'), 'From the ' || v_label, 'meeting', v_label);
    v_added := v_added + 1;
  end loop;

  v_snap := bcps_marcomm_take_snapshot(v_date, to_char(v_date, 'FMMonth FMDD, YYYY') || ': ' || v_label,
                                       nullif(payload->>'summary', ''), 'transcript', 'From the ' || v_label);
  return jsonb_build_object('changed', v_changed, 'added', v_added, 'snapshot_id', v_snap);
end $$;
revoke all on function public.bcps_marcomm_apply_meeting_update(jsonb) from public, anon, authenticated;
grant execute on function public.bcps_marcomm_apply_meeting_update(jsonb) to service_role;
