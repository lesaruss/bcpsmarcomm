-- Audit findings only Finalsite can fix (Sean, Hot Lab 2026-11-03).
-- The scan tags every accessibility finding with who owns the fix. The WCM's
-- audit already leaves the Finalsite-owned ones off its red list; this lists
-- them by rule, from the latest audit of every page, so the District Web Team
-- can see what is being kept off WCM lists and hand it to Finalsite.
create or replace function public.bcps_audit_finalsite_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (coalesce(r.site_page_id::text, r.department_id::text || coalesce(r.page_url, '')))
      r.department_id, r.school_id, r.page_url, r.ada_violations
    from bcps_audit_results r
    where r.audit_version = 3 and r.ada_violations is not null and jsonb_typeof(r.ada_violations) = 'array'
    order by coalesce(r.site_page_id::text, r.department_id::text || coalesce(r.page_url, '')), r.audited_at desc
  ), v as (
    select l.department_id, l.school_id, l.page_url, x as viol, x->>'id' as vid
    from latest l, jsonb_array_elements(l.ada_violations) x
    where x->>'owner' = 'finalsite'
  ), agg as (
    select vid, (array_agg(viol))[1] as meta, count(*) as items,
           count(distinct page_url) as pages, count(distinct department_id) as departments
    from v group by vid
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.vid,
    'description', a.meta->>'description',
    'impact', a.meta->>'impact',
    'help_url', a.meta->>'helpUrl',
    'items', a.items, 'pages', a.pages, 'departments', a.departments,
    'examples', (
      select coalesce(jsonb_agg(q.e), '[]'::jsonb) from (
        select jsonb_build_object('page_url', v.page_url, 'owner', coalesce(d.name, s.name)) as e
        from v
        left join bcps_departments d on d.id = v.department_id
        left join bcps_schools s on s.id = v.school_id
        where v.vid = a.vid
        group by v.page_url, coalesce(d.name, s.name)
        order by coalesce(d.name, s.name), v.page_url
        limit 15
      ) q
    )
  ) order by a.pages desc), '[]'::jsonb)
  from agg a;
$$;
revoke all on function public.bcps_audit_finalsite_summary() from public, anon, authenticated;
grant execute on function public.bcps_audit_finalsite_summary() to service_role;
