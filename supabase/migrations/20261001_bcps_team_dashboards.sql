-- Team dashboards (Sean, 2026-10-01, mock v3 "Team Dashboards").
-- 1. Every District Web Team member can open the Widgets page and click
--    through each widget (Sean: "all will be able to see it"). Editing stays
--    per widget, on each widget's own acl object, unchanged. Before this the
--    Widgets page was granted only to Web Content Management and one user, so
--    most of the team could not reach it.
-- 2. bcps_director_accounts(): director emails on file that have a sign-in
--    account, for the "Directors signed in" number. auth.users is not exposed
--    through PostgREST, so the count is answered here, service role only.
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-10-01.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'widgets'
  and g.brand = 'bcps' and g.name = 'District Web Team'
  and not exists (
    select 1 from public.acl_grants x
    where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id
  );

create or replace function public.bcps_director_accounts()
returns table (email text)
language sql
security definer
set search_path = public, auth
as $$
  select distinct lower(trim(d.director_email))
  from public.bcps_departments d
  join auth.users u on lower(u.email) = lower(trim(d.director_email))
  where d.director_email is not null
$$;
revoke all on function public.bcps_director_accounts() from public, anon, authenticated;
grant execute on function public.bcps_director_accounts() to service_role;
