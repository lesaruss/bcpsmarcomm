-- MarComm Assignments editors (Sean, 2026-10-21): "Jennifer Hodder, obviously
-- myself, Felicia, and Farrah have the ability to make edits, use all the
-- tools that we've created. Everyone else should only have view access, so
-- they can just basically see it during the meetings." Editors also upload
-- meeting transcripts and delete notes.
--
-- The transcript-upload page ('marcomm-transcripts', 20261021_bcps_marcomm_
-- transcript_upload) becomes the editor page, 'marcomm-edit': every write to
-- /api/bcps/marcomm-requests and /api/bcps/calendar-requests and the MarComm
-- transcript upload check it. Admins and superadmins pass by role. Change who
-- edits on the Permissions page.
update public.acl_objects
   set slug = 'marcomm-edit', title = 'MarComm Assignments editors',
       description = 'Edit MarComm Assignments: update requests, notes and files, delete notes, combine records, calendar posts and meeting transcripts. Everyone else with MarComm Assignments can view only.'
 where brand = 'bcps' and kind = 'page' and slug = 'marcomm-transcripts';

-- Only named people, not the District Web Team group.
delete from public.acl_grants g using public.acl_objects o
 where g.object_id = o.id and o.brand = 'bcps' and o.kind = 'page' and o.slug = 'marcomm-edit'
   and g.subject_type = 'group';

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', s.id, 'view'
  from public.acl_objects o
  cross join (values
    ('cb33a803-cd70-4451-bba7-057c0d3fdb52'::uuid),   -- Jennifer A. Hodder
    ('1ec9accc-8c81-4f6d-8b5e-5c5d8a9c69d2'::uuid),   -- Sean A. Russell (District account)
    ('de7d9477-5a83-422f-b381-ca8734a1d6da'::uuid),   -- Felicia Hicks
    ('2f448e07-325e-4031-9355-8894311f6cf3'::uuid)    -- Farrah A. Wilson
  ) as s(id)
 where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'marcomm-edit'
   and not exists (select 1 from public.acl_grants g where g.object_id = o.id and g.subject_type = 'user' and g.subject_id = s.id);
