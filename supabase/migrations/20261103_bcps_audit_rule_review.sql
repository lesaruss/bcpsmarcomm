-- Audit rule review (Sean, Hot Lab 2026-10-29).
-- Every audit rule that flags pages, one card per rule, so Sean and the
-- District Web Team can approve it, change it, say it does not apply, or ask
-- for input. One row per reviewer per rule, so the team's input is kept side
-- by side and nobody overwrites anybody.

create table if not exists public.bcps_audit_rule_reviews (
  id uuid primary key default gen_random_uuid(),
  check_id text not null,
  reviewer_email text not null,
  reviewer_name text,
  decision text not null check (decision in ('approve', 'change', 'not_applicable', 'discuss')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_id, reviewer_email)
);
alter table public.bcps_audit_rule_reviews enable row level security;
-- No policies: read and written only through /api/bcps/audit-rule-review (service role).

-- One summary of the latest v3 audit result per page: for each rule that has
-- any fail or review, the counts and up to 40 example pages (one per
-- department first, so the examples spread across the district).
create or replace function public.bcps_audit_rule_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (coalesce(r.site_page_id::text, r.department_id::text || coalesce(r.page_url, '')))
      r.department_id, r.school_id, r.page_url, r.audited_at, r.checks
    from bcps_audit_results r
    where r.audit_version = 3 and r.checks is not null and jsonb_typeof(r.checks) = 'array'
    order by coalesce(r.site_page_id::text, r.department_id::text || coalesce(r.page_url, '')), r.audited_at desc
  ), c as (
    select l.department_id, l.school_id, l.page_url, l.audited_at, x as chk, x->>'id' as cid, x->>'status' as st
    from latest l, jsonb_array_elements(l.checks) x
  ), agg as (
    select cid,
      (array_agg(chk order by audited_at desc))[1] as meta,
      count(*) filter (where st = 'fail') as fail,
      count(*) filter (where st = 'review') as review,
      count(*) filter (where st = 'pass') as pass,
      count(distinct department_id) filter (where st in ('fail', 'review')) as departments,
      count(distinct page_url) filter (where st in ('fail', 'review')) as pages
    from c group by cid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.cid,
    'area', a.meta->>'area',
    'title', a.meta->>'title',
    'why', a.meta->>'why',
    'steps', a.meta->'steps',
    'course', a.meta->'course',
    'fail', a.fail, 'review', a.review, 'pass', a.pass,
    'departments', a.departments, 'pages', a.pages,
    'examples', (
      select coalesce(jsonb_agg(q.e order by q.rk, q.nm, q.url), '[]'::jsonb) from (
        select jsonb_build_object('page_url', c.page_url, 'status', c.st, 'detail', c.chk->>'detail',
                 'items', c.chk->'items', 'owner', coalesce(d.name, s.name)) as e,
               row_number() over (partition by c.department_id order by c.page_url) as rk,
               coalesce(d.name, s.name, '') as nm, c.page_url as url
        from c
        left join bcps_departments d on d.id = c.department_id
        left join bcps_schools s on s.id = c.school_id
        where c.cid = a.cid and c.st in ('fail', 'review')
        order by 2, 3, 4
        limit 40
      ) q
    )
  ) order by (a.fail + a.review) desc), '[]'::jsonb)
  from agg a where a.fail + a.review > 0;
$$;
revoke all on function public.bcps_audit_rule_summary() from public, anon, authenticated;
grant execute on function public.bcps_audit_rule_summary() to service_role;

-- The page. Admins pass by role; the District Web Team group is granted view
-- so the team can give input without an admin role.
insert into public.acl_objects (brand, kind, slug, title, visibility, description)
select 'bcps', 'page', 'audit-rules-review', 'Audit Rule Review', 'restricted',
       'Review every audit rule that flags pages: approve, change, or say it does not apply.'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'page' and slug = 'audit-rules-review');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'dwt'
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'audit-rules-review'
  and not exists (
    select 1 from public.acl_grants x
    where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id
  );
