-- Instructional Innovation and Digital Learning Guide (Sean, 2026-11-03): the second
-- department guide, same format as early-childhood-education. A restricted guide that is
-- the department's home on bcpsmarcomm.com. Its content lives in bcps_guides.def (written
-- through a one-time function, never in this repository, which is public); this file is
-- the record of the access rows.
--
-- Group members (default, Sean did not object): the five approved roster WCMs (Rebecca
-- Malones, Jorge Padron, Angelique Lynch, Karen Kaya, Janice Brim) and Alex Macri, the
-- widget editor. Thomas Correll, the director, has no account yet, so he is queued in
-- bcps_pending_group_members and joins on first sign-in.

insert into public.acl_groups (brand, slug, name, description)
select 'bcps', 'instructional-innovation-digital-learning', 'Instructional Innovation and Digital Learning', 'The Instructional Innovation and Digital Learning team. Members can read the department guide, a home for the team. Created 2026-11-03 per Sean.'
where not exists (select 1 from public.acl_groups where brand = 'bcps' and slug = 'instructional-innovation-digital-learning');

insert into public.acl_group_members (group_id, user_id)
select g.id, u.id::uuid
from public.acl_groups g,
  (values ('8da48bee-5a81-4ef7-af3e-1dfc8b13b93e'), ('35fc1464-8d75-450f-b534-dd2d4be957ba'), ('8e391d33-0c93-44d3-91dd-552024b2da41'),
          ('f070e04a-7d58-49d9-a736-89e4dfbc38e9'), ('d6847e29-8d18-49c5-9241-57ab05812223'), ('88275e04-8ae5-4139-bd57-7f240ccbbc0c')) as u(id)
where g.brand = 'bcps' and g.slug = 'instructional-innovation-digital-learning'
  and not exists (select 1 from public.acl_group_members m where m.group_id = g.id and m.user_id = u.id::uuid);

insert into public.bcps_pending_group_members (email, group_id, added_by)
select 'thomas.correll@browardschools.com', g.id, 'logan'
from public.acl_groups g
where g.brand = 'bcps' and g.slug = 'instructional-innovation-digital-learning'
  and not exists (select 1 from public.bcps_pending_group_members p where p.group_id = g.id and lower(p.email) = 'thomas.correll@browardschools.com');

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'instructional-innovation-digital-learning', 'Instructional Innovation and Digital Learning Guide',
  'Everything Instructional Innovation and Digital Learning has on bcpsmarcomm.com in one place: your services directory, your website page and your audit.',
  'Guide', 'restricted', 'documents', '/playbooks/instructional-innovation-digital-learning', 'Departments', 'November 3, 2026', '2026-11-03'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'instructional-innovation-digital-learning');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'instructional-innovation-digital-learning'
  and g.brand = 'bcps' and g.slug = 'instructional-innovation-digital-learning'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);
