-- District Web Team Guide (Sean, 2026-11-03): one restricted guide for what the
-- District Web Team has in development and coming, for departments and for
-- schools. Its content is written straight into bcps_guides.def and is not in
-- this file or anywhere in the repository, which is public (the table is
-- created in 20261030_bcps_website_platform_guide.sql).
--
-- Readers, set by Sean on 2026-11-03: the District Web Team group, plus
-- Charlene A. Collins and Luis A. Morales, who get "the same access we give
-- Farrah" (Sean). Nobody else is added, and no other document's reader list is
-- combined into this one. Charlene has no account yet, so her recipient row
-- lets her in as soon as she signs up. Apply once the code that opens the
-- guide is live.

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'district-web-team', 'District Web Team Guide',
  'What the District Web Team has in development and coming for departments and for schools, the decisions waiting on the team, and a calendar.',
  'Guide', 'restricted', 'documents', '/playbooks/district-web-team', 'District Web Team', 'November 3, 2026', '2026-11-03'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'district-web-team');

-- The District Web Team group.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'district-web-team'
  and g.name = 'District Web Team'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);

-- The two added readers, by email (opens the guide through requireDocumentAccess).
insert into public.bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
select 'district-web-team', r.name, r.email, 'district-web-team-guide (approved by Sean, 2026-11-03)'
from (values
  ('Charlene A. Collins', 'charlene.collins@browardschools.com'),
  ('Luis A. Morales', 'luis.morales@browardschools.com')
) as r(name, email)
where not exists (select 1 from public.bcps_brief_recipients x where x.brief_slug = 'district-web-team' and lower(x.attendee_email) = r.email);

-- Listed in Documents for the one who already has an account.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view'
from public.acl_objects o
join auth.users u on lower(u.email) = 'luis.morales@browardschools.com'
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'district-web-team'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'user' and x.subject_id = u.id);
