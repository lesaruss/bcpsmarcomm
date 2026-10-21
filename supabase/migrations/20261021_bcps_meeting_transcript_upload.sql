-- Meeting transcript upload for Web Team Assignments (Sean, 2026-10-21, during
-- the District Web Team meeting): "anyone that's designated can upload a
-- transcript to update the records without me having to do it."
--
-- Until now a meeting reached the tracker only when Sean handed the transcript
-- to Claude on the back end (canon-bcps-web-team-assignments-meeting-updates),
-- and a new row needed an edit to public/bcps-web-team-assignments.html. Now:
--   1. A designated person pastes or uploads the transcript on the page.
--   2. /api/bcps/meeting-transcript asks Claude for the changes under the same
--      rule and saves the proposal here (bcps_meeting_uploads).
--   3. They review it, untick anything wrong, and apply it. This function
--      writes the changes and a dated note on every row it touches.
-- New rows live only in bcps_assignment_tags (added_from_meeting is set);
-- /api/bcps/web-team-assignments-html adds them to the page as it serves it.
--
-- Who is designated: anyone granted the 'meeting-transcripts' page (below),
-- plus BCPS admins and superadmins. It starts granted to the District Web
-- Team group; widen or narrow it on the Permissions page.

alter table public.bcps_assignment_tags
  add column if not exists description_override text,
  add column if not exists added_from_meeting text,
  add column if not exists added_at timestamptz;

create table if not exists public.bcps_meeting_uploads (
  id uuid primary key default gen_random_uuid(),
  tracker text not null default 'web-team',
  meeting_date date not null,
  meeting_label text not null,
  transcript text not null,
  proposal jsonb,
  applied_payload jsonb,
  result jsonb,
  status text not null default 'proposed' check (status in ('proposed', 'applied', 'discarded', 'failed')),
  error text,
  uploaded_by_email text not null,
  uploaded_by_name text,
  applied_by_email text,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
alter table public.bcps_meeting_uploads enable row level security;
-- No policies: only the service role (the API route) reads or writes it.

-- payload: {
--   "meeting_date": "2026-10-21", "meeting_label": "District Web Team Meeting",
--   "summary": "...",
--   "changes": [{ "slug": "...", "status"?, "lead"?, "support"?: ["..."],
--                 "start_date"?, "deadline_date"?, "priority"?, "ooc"?,
--                 "title"?, "description"?, "note": "..." }],
--   "new_items": [{ "title": "...", "description"?, "lead"?, "support"?: [...],
--                   "deadline_date"?, "priority"?, "ooc"?, "note"? }]
-- }
create or replace function public.bcps_web_team_apply_meeting_update(payload jsonb, p_author text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_date date := (payload->>'meeting_date')::date;
  v_label text := coalesce(nullif(payload->>'meeting_label', ''), 'Web Team Meeting');
  v_prefix text;
  v_author text := coalesce(nullif(p_author, ''), 'Meeting upload');
  c jsonb; v_slug text; v_base text; v_n int; v_changed int := 0; v_added int := 0;
  v_skipped jsonb := '[]'::jsonb; v_new_slugs jsonb := '[]'::jsonb;
begin
  if v_date is null then raise exception 'meeting_date is required'; end if;
  v_prefix := to_char(v_date, 'Mon FMDD') || ' ' || v_label || ': ';

  for c in select * from jsonb_array_elements(coalesce(payload->'changes', '[]'::jsonb)) loop
    v_slug := nullif(c->>'slug', '');
    if v_slug is null then continue; end if;
    -- A row the page has never saved has no tags row yet; make one so the
    -- change has somewhere to land.
    insert into bcps_assignment_tags (assignment_slug) values (v_slug) on conflict (assignment_slug) do nothing;
    update bcps_assignment_tags set
      status = case when c ? 'status' then c->>'status' else status end,
      completed_at = case when c ? 'status' then (case when c->>'status' in ('completed', 'archived') then coalesce(completed_at, now()) else null end) else completed_at end,
      lead_override = case when c ? 'lead' then nullif(c->>'lead', '') else lead_override end,
      support_override = case when c ? 'support' then array(select jsonb_array_elements_text(c->'support')) else support_override end,
      start_date = case when c ? 'start_date' then nullif(c->>'start_date', '')::date else start_date end,
      deadline_date = case when c ? 'deadline_date' then nullif(c->>'deadline_date', '')::date else deadline_date end,
      overdue_dismissed = case when c ? 'deadline_date' then false else overdue_dismissed end,
      priority = case when c ? 'priority' then nullif(c->>'priority', '') else priority end,
      team_ooc = case when c ? 'ooc' then (c->>'ooc')::boolean else team_ooc end,
      title_override = case when c ? 'title' then nullif(c->>'title', '') else title_override end,
      description_override = case when c ? 'description' then nullif(c->>'description', '') else description_override end,
      updated_at = now()
    where assignment_slug = v_slug;
    insert into bcps_assignment_notes (assignment_slug, note_text, author)
      values (v_slug, v_prefix || coalesce(nullif(c->>'note', ''), 'Updated in the meeting.'), v_author);
    v_changed := v_changed + 1;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(payload->'new_items', '[]'::jsonb)) loop
    if nullif(c->>'title', '') is null then continue; end if;
    v_base := trim(both '-' from left(regexp_replace(lower(c->>'title'), '[^a-z0-9]+', '-', 'g'), 60));
    if v_base = '' then v_base := 'meeting-item'; end if;
    v_slug := v_base; v_n := 1;
    while exists (select 1 from bcps_assignment_tags where assignment_slug = v_slug) loop
      v_n := v_n + 1; v_slug := v_base || '-' || v_n;
    end loop;
    insert into bcps_assignment_tags (assignment_slug, title_override, description_override, lead_override, support_override,
                                      deadline_date, priority, team_ooc, team_app_services, status, added_from_meeting, added_at, updated_at)
      values (v_slug, left(c->>'title', 200), nullif(c->>'description', ''), nullif(c->>'lead', ''),
              case when c ? 'support' then array(select jsonb_array_elements_text(c->'support')) else null end,
              nullif(c->>'deadline_date', '')::date, nullif(c->>'priority', ''),
              coalesce((c->>'ooc')::boolean, true), false,
              case when nullif(c->>'lead', '') is not null then 'in-progress' else 'pending' end,
              to_char(v_date, 'Mon FMDD') || ' ' || v_label, now(), now());
    insert into bcps_assignment_notes (assignment_slug, note_text, author)
      values (v_slug, v_prefix || coalesce(nullif(c->>'note', ''), 'Added in the meeting.'), v_author);
    v_new_slugs := v_new_slugs || to_jsonb(v_slug);
    v_added := v_added + 1;
  end loop;

  update bcps_tracker_meta set
    version_number = coalesce(version_number, 0) + 1,
    meeting_update_summary = coalesce(nullif(payload->>'summary', ''), meeting_update_summary),
    updated_at = now()
  where id = (select min(id) from bcps_tracker_meta);

  return jsonb_build_object('changed', v_changed, 'added', v_added, 'new_slugs', v_new_slugs);
end $$;
revoke all on function public.bcps_web_team_apply_meeting_update(jsonb, text) from public, anon, authenticated;
grant execute on function public.bcps_web_team_apply_meeting_update(jsonb, text) to service_role;

-- The designation. Registered as a page so the Permissions page can grant it
-- like any other; requireBcpsPageAccess(req, 'meeting-transcripts') reads it.
insert into public.acl_objects (brand, kind, slug, title, visibility, description)
select 'bcps', 'page', 'meeting-transcripts', 'Meeting Transcript Upload', 'restricted',
       'Upload a meeting transcript to update Web Team Assignments.'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'page' and slug = 'meeting-transcripts');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'dwt'
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'meeting-transcripts'
  and not exists (
    select 1 from public.acl_grants x
    where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id
  );
