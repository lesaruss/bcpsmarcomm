-- A department's site includes its main page's quick links, not only its left
-- menu (Sean, 2026-10-20, Hot Lab with Matthew Cordova, Charter Schools: the
-- FAQs, Application Process, Contact List and School Grades pages are quick
-- links on the main page and were missing from the audit).
--   quick_link  found by the page finder in the main page's content
--               (lib/dept-audit-run discoverDeptPages), including Finalsite
--               /fs/pages/<id> short links followed to where they land
--   wcm_added   added by the department's WCM with "Add a missing page"
--               (/api/bcps/site-audit action add_page); added_by records who
alter table public.bcps_site_pages drop constraint if exists bcps_site_pages_source_check;
alter table public.bcps_site_pages add constraint bcps_site_pages_source_check
  check (source = any (array['main', 'left_nav', 'quick_link', 'manual', 'wcm_added']));
alter table public.bcps_site_pages add column if not exists added_by text;
