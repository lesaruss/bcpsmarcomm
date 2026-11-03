-- Early Childhood Education Guide (Sean, 2026-11-03): the first department guide, a
-- restricted guide that is the department's home on bcpsmarcomm.com (its widget, its
-- website page, its audit). Like the other restricted guides, its content is written
-- straight into bcps_guides.def (through a one-time function, because HTML in SQL
-- stalls the connector) and is not in this file or anywhere in the repository, which
-- is public. Applied 2026-11-03; this file is the record of the access rows.
--
-- Readers: the two Department Web Content Managers for Early Childhood Education,
-- Lindsey M. Way and Jennifer Amador. Anyone else is added by a grant on this row
-- (user or group), so the guide does not depend on being a WCM or a director.

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'early-childhood-education', 'Early Childhood Education Guide',
  'Everything Early Childhood Education has on bcpsmarcomm.com in one place: your widget, your website page and your audit.',
  'Guide', 'restricted', 'documents', '/playbooks/early-childhood-education', 'Departments', 'November 3, 2026', '2026-11-03'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'early-childhood-education');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id::uuid, 'view'
from public.acl_objects o,
  (values ('3ea6c309-b58c-48d0-b1db-fb0475af41d0'), ('9b3e2f3c-e371-4dfc-99dc-98bde13366c4')) as u(id)
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'early-childhood-education'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'user' and x.subject_id = u.id::uuid);
