-- Charlene Collins, Director, Application Services (Sean, 2026-11-09): the same
-- access as Tricia Allen, her assistant director, so she can follow the District
-- Web Team's work. She has no account yet, so the District Web Team group is
-- queued here and joins on her first sign-in (her Directors group row was queued
-- 2026-10-20). Tricia's two direct document grants (bcps-wcm-scope-2026 and
-- website-platform, view) are added once the invitation creates her account.
-- View only: Tricia's manage grant on the District Web Team Guide is not copied;
-- the group gives Charlene view on it.

insert into public.bcps_pending_group_members (email, group_id, added_by)
select 'charlene.collins@browardschools.com', g.id, 'logan-2026-11-09'
from public.acl_groups g
where g.brand = 'bcps' and g.slug = 'dwt'
  and not exists (select 1 from public.bcps_pending_group_members p where p.group_id = g.id and lower(p.email) = 'charlene.collins@browardschools.com');
