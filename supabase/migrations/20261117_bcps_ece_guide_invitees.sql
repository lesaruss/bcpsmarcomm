-- Early Childhood Education guide: queue the rest of the team Lindsey Way named
-- on 2026-10-08 (Sean, 2026-11-17). None has an account yet, so each is queued
-- in bcps_pending_group_members and joins the department group, and with it the
-- Early Childhood Education Guide, on first sign-in. Being queued also keeps
-- them out of the WCM group at registration (wcm-pilot-register), so they get
-- the department experience: their guide only. Sharonda Bailey (director) was
-- queued on 2026-11-03.
insert into public.bcps_pending_group_members (email, group_id, added_by)
select v.email, g.id, 'logan'
from (values
  ('paul.gress@browardschools.com'),
  ('liz.glaid@browardschools.com'),
  ('kimberly.eichner@browardschools.com')
) as v(email)
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'early-childhood-education'
where not exists (
  select 1 from public.bcps_pending_group_members p
  where p.group_id = g.id and p.email = v.email
);
