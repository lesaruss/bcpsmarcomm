-- Applied 2026-10-29 through ve-once-bcps-audit-requeue-1029 (now a 410 stub): 155 pages queued.
-- Re-audit the department pages whose only single-column problem was side-by-side sections (Sean, Oct 29),
-- so their scores follow the corrected check (PR #198) now rather than at next month's run.
with latest as (
  select distinct on (r.site_page_id) r.site_page_id, r.department_id, r.checks
  from public.bcps_audit_results r
  where r.school_id is null and r.department_id is not null and r.site_page_id is not null and r.checks is not null
  order by r.site_page_id, r.audited_at desc
), pick as (
  select l.site_page_id, l.department_id from latest l
  join public.bcps_site_pages p on p.id = l.site_page_id and p.active and p.department_id = l.department_id
  where exists (select 1 from jsonb_array_elements(l.checks) c
                where c->>'id' = 'single-column' and c->>'status' = 'fail' and c->>'detail' not like 'The page itself%')
)
insert into public.bcps_audit_queue (department_id, site_page_id, kind, run_month, requested_by)
select k.department_id, k.site_page_id, 'page', date_trunc('month', now())::date, 'logan:single-column-recheck'
from pick k
where not exists (select 1 from public.bcps_audit_queue q where q.site_page_id = k.site_page_id and q.status in ('queued','running'));
