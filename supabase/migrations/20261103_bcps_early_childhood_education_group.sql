-- Early Childhood Education team group (Sean, 2026-11-03). The department guide is
-- granted to this group rather than to individual people, so adding someone to the
-- department's home is a group change, not a code change (the pattern for every
-- department guide). Applied 2026-11-03.
--
-- Members: Lindsey M. Way and Jennifer Amador (the department's Web Content
-- Managers). Sharonda Davis Bailey, the department's director, has no account yet,
-- so she is queued in bcps_pending_group_members and joins on first sign-in.
-- Her queued membership in the district-wide Directors group is separate.

insert into public.acl_groups (brand, slug, name, description)
select 'bcps', 'early-childhood-education', 'Early Childhood Education', 'The Early Childhood Education team. Members can read the Early Childhood Education Guide, a department home for the team. Created 2026-11-03 per Sean.'
where not exists (select 1 from public.acl_groups where brand = 'bcps' and slug = 'early-childhood-education');

insert into public.acl_group_members (group_id, user_id)
select g.id, u.id::uuid
from public.acl_groups g,
  (values ('3ea6c309-b58c-48d0-b1db-fb0475af41d0'), ('9b3e2f3c-e371-4dfc-99dc-98bde13366c4')) as u(id)
where g.brand = 'bcps' and g.slug = 'early-childhood-education'
  and not exists (select 1 from public.acl_group_members m where m.group_id = g.id and m.user_id = u.id::uuid);

insert into public.bcps_pending_group_members (email, group_id, added_by)
select 'sharonda.bailey@browardschools.com', g.id, 'logan'
from public.acl_groups g
where g.brand = 'bcps' and g.slug = 'early-childhood-education'
  and not exists (select 1 from public.bcps_pending_group_members p where p.group_id = g.id and lower(p.email) = 'sharonda.bailey@browardschools.com');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'early-childhood-education'
  and g.brand = 'bcps' and g.slug = 'early-childhood-education'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);
