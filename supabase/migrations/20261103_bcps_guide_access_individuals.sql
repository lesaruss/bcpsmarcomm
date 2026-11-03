-- Guide access, Sean 2026-11-03.
-- 1. The District Web Team group no longer reads the Department WCM Guide or the
--    Director Guide. Felicia Hicks and Sean Russell are named on both. The
--    wcm and directors groups keep the grants they have (directors without an
--    account are already queued in bcps_pending_group_members).
-- 2. The Director Guide goes from public to restricted so it is listed only for
--    people holding a grant.
-- 3. Rudy Carril and Tricia Allen join Vanessa Deslandes as managers (admins)
--    of the District Web Team Guide; the dwt group keeps view on it.
-- 4. Vanessa leaves the legacy WCM row in bcps_user_groups (she was never in
--    the acl wcm group, which is what the guides check).

delete from public.acl_grants g
using public.acl_objects o, public.acl_groups gr
where g.object_id = o.id
  and o.brand = 'bcps' and o.kind = 'document' and o.slug in ('wcm-department', 'director-department')
  and g.subject_type = 'group' and g.subject_id::text = gr.id::text
  and gr.brand = 'bcps' and gr.slug = 'dwt';

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view'
from public.acl_objects o
join auth.users u on lower(u.email) in ('felicia.hicks@browardschools.com', 'sean.russell@browardschools.com')
where o.brand = 'bcps' and o.kind = 'document' and o.slug in ('wcm-department', 'director-department')
on conflict (object_id, subject_type, subject_id) do nothing;

update public.acl_objects set visibility = 'restricted', updated_at = now()
where brand = 'bcps' and kind = 'document' and slug = 'director-department';

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'manage'
from public.acl_objects o
join auth.users u on lower(u.email) in ('rudy.carril@browardschools.com', 'tricia.allen@browardschools.com')
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'district-web-team'
on conflict (object_id, subject_type, subject_id) do update set role = 'manage';

delete from public.bcps_user_groups ug
using public.bcps_groups bg, auth.users u
where ug.group_id = bg.id and bg.slug = 'wcm'
  and ug.user_id = u.id and lower(u.email) = 'vanessa.deslandes@browardschools.com';
