-- Home School Education gets its own department (Sean, 2026-11-16). It is one page inside the
-- Magnet site, and Deanna Greist (its WCM) shared the Magnet & Innovative Programs roster with
-- Allan Llanos, so her audit listed every Magnet page and Allan's listed hers. Audits are scoped
-- by department, so the page moves to a department of its own: Deanna's audit is that one page,
-- and Magnet's audit no longer includes it. Same office and director as Magnet. Applied through
-- execute_sql the same day.
insert into public.bcps_departments (slug, name, division, division_slug, director_name, chief_title, chief_name, wcm_name, director_email, director_email_source, website_url, notes)
select 'home-school-education', 'Home School Education', d.division, d.division_slug, d.director_name, d.chief_title, d.chief_name, 'Deanna Greist', d.director_email, d.director_email_source,
  'https://www.browardschools.com/bcps-departments/academics/magnet-programs/home-school-education',
  'Split from Magnet & Innovative Programs 2026-11-16 (Sean) so the Home School Education page audits on its own. Same office and director as Magnet.'
from public.bcps_departments d where d.id = 'b272b4d5-a9b1-4e19-bdd8-49a5838e9848'
and not exists (select 1 from public.bcps_departments where slug = 'home-school-education');

-- The page: retired from Magnet (discovery skips inactive rows), added as the new department's main page.
update public.bcps_site_pages set active = false, is_main = false
where department_id = 'b272b4d5-a9b1-4e19-bdd8-49a5838e9848'
  and url = 'https://www.browardschools.com/bcps-departments/academics/magnet-programs/home-school-education';
insert into public.bcps_site_pages (department_id, url, title, is_main, source, added_by, active)
select d.id, 'https://www.browardschools.com/bcps-departments/academics/magnet-programs/home-school-education', 'Home School Education', true, 'manual', 'logan', true
from public.bcps_departments d where d.slug = 'home-school-education'
and not exists (select 1 from public.bcps_site_pages p where p.department_id = d.id and p.url = 'https://www.browardschools.com/bcps-departments/academics/magnet-programs/home-school-education');

-- Roster: Deanna moves to the new department; Magnet keeps Allan.
insert into public.bcps_wcm_roster (department_name, location_number, matched_department_id, director_name, no_website)
select 'HOME SCHOOL EDUCATION', r.location_number, d.id, r.director_name, false
from public.bcps_wcm_roster r, public.bcps_departments d
where r.id = 'be78027e-a564-4c2d-8fcc-87e19b388d58' and d.slug = 'home-school-education'
and not exists (select 1 from public.bcps_wcm_roster x where x.matched_department_id = d.id);
update public.bcps_wcm_roster_members m set roster_id = r.id, sub_department = null
from public.bcps_wcm_roster r join public.bcps_departments d on d.id = r.matched_department_id
where d.slug = 'home-school-education' and m.id = 'fae3a386-e24e-435e-afac-e731beeb6429';
update public.bcps_departments set wcm_name = 'Allan Llanos', updated_at = now()
where id = 'b272b4d5-a9b1-4e19-bdd8-49a5838e9848' and wcm_name = 'Deanna Greist';

-- Audit the page under its new department.
insert into public.bcps_audit_queue (department_id, site_page_id, kind, run_month, requested_by)
select p.department_id, p.id, 'page', date_trunc('month', now())::date, 'logan'
from public.bcps_site_pages p join public.bcps_departments d on d.id = p.department_id
where d.slug = 'home-school-education' and p.active
and not exists (select 1 from public.bcps_audit_queue q where q.site_page_id = p.id);

-- Profile label to match.
update public.wcm_cert_users set department = 'Home School Education'
where lower(email) = 'deanna.greist@browardschools.com' and department = 'Magnet & Innovative Programs';
