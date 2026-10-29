-- Applied 2026-10-29 through ve-once-bcps-it-owner-1029 (now a 410 stub): 75 duplicate page rows taken off five departments' audits.
-- The Information Systems pages are shared by six IT departments; Sean named Application Services the one
-- owner (2026-10-29). The other departments' copies leave their audits, recorded like the audit's Remove outcome.
with shared as (
  select url from public.bcps_site_pages where department_id='5a9d258d-3cdd-4728-97e9-c08404dad47d' and active
), gone as (
  select p.id, p.department_id from public.bcps_site_pages p join shared s on s.url=p.url
  where p.active and p.department_id <> '5a9d258d-3cdd-4728-97e9-c08404dad47d' and p.school_id is null
), rec as (
  insert into public.bcps_page_reclass_requests (department_id, site_page_id, note, requested_by, requested_at, status, resolved_by, resolved_at)
  select g.department_id, g.id, 'Information Systems pages have one owner: Application Services (Sean A. Russell, Oct 29).', 'logan', now(), 'removed', 'logan', now() from gone g
  returning site_page_id
)
update public.bcps_site_pages p set active=false from gone g where p.id=g.id;
