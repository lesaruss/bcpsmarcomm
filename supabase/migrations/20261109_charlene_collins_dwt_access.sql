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

-- 2026-11-09 (later): the director walkthrough media lives in Storage, not in
-- this repository: bcps-public/dashboard-media/charlene-walkthrough-v2.mp4 (and
-- -poster.jpg), and the tour lines in site-audio/bcps/director-tour-1..8.mp3.
-- Recording Queue batch bcps-charlene-walkthrough holds the scripts.

-- 2026-11-09 (Sean: she opens banner and Proud Points submissions). Run once the
-- invitation has created her account (both tables key on user_id):
--   insert into public.bcps_banner_admins (user_id, email, role, added_by_email, notify_on_submit)
--   select id, email, 'manager', 'logan', false from auth.users where lower(email) = 'charlene.collins@browardschools.com'
--   and not exists (select 1 from public.bcps_banner_admins b where lower(b.email) = 'charlene.collins@browardschools.com');
--   Tricia's direct document grants: view on bcps-wcm-scope-2026 and website-platform.
-- Manager, not admin: she sees the Banner and Proud Points review queues; only
-- the admin list itself stays with admins. No email on every submission.
