-- 2026-11-03 (V and Sean): who sees what in the BCPS guides.
-- Applied already through a one-time edge function (the connector held the
-- write for approval); this file records the same SQL. Safe to run twice.

-- Broward Powered by AI: user-by-user access instead of the whole OOC group.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view'
from public.acl_objects o, auth.users u
where o.brand = 'bcps' and o.slug = 'broward-powered-by-ai'
  and u.email in ('farrah.wilson@browardschools.com', 'luis.morales@browardschools.com', 'felicia.hicks@browardschools.com')
  and not exists (select 1 from public.acl_grants g where g.object_id = o.id and g.subject_type = 'user' and g.subject_id::text = u.id::text);

delete from public.acl_grants g using public.acl_groups gr
where g.object_id = (select id from public.acl_objects where brand = 'bcps' and slug = 'broward-powered-by-ai')
  and g.subject_type = 'group' and g.subject_id::text = gr.id::text and gr.brand = 'bcps' and gr.slug = 'ooc';

-- Website Redirects playbook: Iviani Figueroa is not on it.
delete from public.bcps_brief_recipients
where brief_slug = 'bcps-website-redirects' and attendee_email = 'iviani.figueroa@browardschools.com';

-- Luis Morales stays a director / OOC reader, not a department WCM.
delete from public.acl_group_members m using public.acl_groups g, auth.users u
where m.group_id = g.id and g.brand = 'bcps' and g.slug = 'wcm' and m.user_id = u.id
  and u.email = 'luis.morales@browardschools.com';
