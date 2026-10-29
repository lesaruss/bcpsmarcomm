-- Oct 29 Hot Lab: Welcome to Kindergarten pages move from Early Childhood Education to Elementary
-- Learning (Jamie Ferguson). Applied 2026-10-29 through ve-once-bcps-audit-fixes-1029 (now a 410 stub).
-- Welcome to Kindergarten belongs to Elementary Learning (WCM Jamie Ferguson), not Early Childhood
-- Education (Raised by Jennifer Amador at the Oct 29 Hot Lab.. Same steps as the audit's Move outcome.
with src as (
  select id, url, title from public.bcps_site_pages
  where department_id='e07f7eda-fb6d-4a45-ac78-91e2c20272ab' and active and url like 'https://www.browardschools.com/bcps-departments/academics/early-childhood-education/welcome-to-kindergarten%'
), rec as (
  insert into public.bcps_page_reclass_requests (department_id, site_page_id, note, requested_by, requested_at, status, moved_to, resolved_by, resolved_at)
  select 'e07f7eda-fb6d-4a45-ac78-91e2c20272ab', s.id, 'Welcome to Kindergarten belongs to Elementary Education (Jamie Ferguson). Raised by Jennifer Amador at the Oct 29 Hot Lab.', 'logan', now(), 'moved', 'd2ab5087-feb4-4a7c-8b15-dff6411f179f', 'logan', now() from src s
  returning site_page_id
), reactivated as (
  update public.bcps_site_pages p set active=true, last_seen_at=now()
  from src s where p.department_id='d2ab5087-feb4-4a7c-8b15-dff6411f179f' and p.url=s.url and not p.active returning p.id
), ins as (
  insert into public.bcps_site_pages (department_id, url, title, is_main, source, added_by, active)
  select 'd2ab5087-feb4-4a7c-8b15-dff6411f179f', s.url, s.title, false, 'manual', 'logan', true from src s
  where not exists (select 1 from public.bcps_site_pages p where p.department_id='d2ab5087-feb4-4a7c-8b15-dff6411f179f' and p.url=s.url)
  returning id
), q as (
  insert into public.bcps_audit_queue (department_id, site_page_id, kind, run_month, requested_by)
  select 'd2ab5087-feb4-4a7c-8b15-dff6411f179f', x.id, 'page', date_trunc('month', now())::date, 'logan' from (select id from ins union all select id from reactivated) x
  returning id
)
update public.bcps_site_pages p set active=false from src s where p.id=s.id;
