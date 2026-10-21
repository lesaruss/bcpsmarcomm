-- Meeting transcript upload for MarComm Assignments (Sean, 2026-10-21: "add
-- the option that we added to the web team ... that way Jen would be able to
-- do it herself"). The same flow as Web Team Assignments
-- (20261021_bcps_meeting_transcript_upload): a designated person pastes or
-- uploads the Marcomm Meeting transcript, Claude proposes changes, they review
-- and apply. Applying runs the existing bcps_marcomm_apply_meeting_update,
-- which writes a dated meeting note on each row and saves the meeting
-- snapshot. Uploads are kept in bcps_meeting_uploads with tracker 'marcomm'.
--
-- Who is designated: anyone granted the 'marcomm-transcripts' page, plus BCPS
-- admins and superadmins. It starts with Jennifer A. Hodder and the District
-- Web Team group; widen or narrow it on the Permissions page.
insert into public.acl_objects (brand, kind, slug, title, description, visibility, sensitive)
select 'bcps', 'page', 'marcomm-transcripts', 'MarComm Meeting Transcript Upload',
       'Upload a Marcomm Meeting transcript to update MarComm Assignments.', 'restricted', false
 where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'page' and slug = 'marcomm-transcripts');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, s.subject_type, s.subject_id, 'view'
  from public.acl_objects o
  cross join (values
    ('user', 'cb33a803-cd70-4451-bba7-057c0d3fdb52'::uuid),   -- Jennifer A. Hodder
    ('group', '8454d61f-af8b-486f-a25d-37af7f1ec0a0'::uuid)   -- District Web Team
  ) as s(subject_type, subject_id)
 where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'marcomm-transcripts'
   and not exists (select 1 from public.acl_grants g where g.object_id = o.id and g.subject_type = s.subject_type and g.subject_id = s.subject_id);
