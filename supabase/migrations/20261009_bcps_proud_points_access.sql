-- Proud Points and Your Submissions are for school WCMs and the District Web
-- Team only (Sean, 2026-10-08). They were registered 'public' (every member).
-- Restricted now, with a view grant to the District Web Team group. School
-- WCMs hold no acl group, so /api/bcps/my-access adds these two pages for
-- them (lib/school-wcm-pages.ts); BCPS admins and superadmins see every page.
update public.acl_objects set visibility = 'restricted', updated_at = now()
where brand = 'bcps' and kind = 'page' and slug in ('proud-points', 'my-submissions');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o
join public.acl_groups g on g.brand = 'bcps' and g.name = 'District Web Team'
where o.brand = 'bcps' and o.kind = 'page' and o.slug in ('proud-points', 'my-submissions')
  and not exists (
    select 1 from public.acl_grants x
    where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id
  );
