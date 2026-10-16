-- MarComm Meeting group (Sean, 2026-10-16): everyone in the Marcomm Meeting
-- needs an account so they can update their own items on MarComm Assignments.
-- Until now the page was granted only to the 'ooc' and 'dwt' groups, which also
-- open analytics, campaign reports and Web Team pages that not everyone in the
-- meeting should see. This group opens MarComm Assignments and nothing else.
--
-- Membership is written by /api/bcps/marcomm-register, which adds an account
-- only when its email is on the MarComm Meeting roster (bcps_marcomm_team), so
-- the roster stays the single list of who belongs. The onboarding page that
-- calls it is /marcomm-registration.

insert into public.acl_groups (brand, slug, name, description)
select 'bcps', 'marcomm', 'MarComm Meeting',
       'People on the Marcomm Meeting roster. Opens MarComm Assignments only.'
where not exists (select 1 from public.acl_groups where brand = 'bcps' and slug = 'marcomm');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'marcomm'
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'marcomm-assignments'
  and not exists (
    select 1 from public.acl_grants x
    where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id
  );

-- Roster members who already have an account join now, so the group matches
-- the roster from day one.
insert into public.acl_group_members (group_id, user_id)
select g.id, u.id
from public.bcps_marcomm_team t
join auth.users u on lower(u.email) = lower(t.email)
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'marcomm'
where t.kind = 'person'
  and not exists (
    select 1 from public.acl_group_members m where m.group_id = g.id and m.user_id = u.id
  );
