-- Departments whose pages moved (Sean, Oct 27 Hot Lab: "check the other
-- departments that moved"). Each address on file now redirects, and GA4
-- records the page a visitor lands on, so these departments stopped getting
-- analytics when their pages moved (most in July/August 2026). The address
-- becomes the live page, the old paths go in previous_paths so earlier months
-- and old links still count, and the audit's main page follows the address so
-- its history stays with it.
--
-- Benefits keeps its landing page as its address (its audit stays off the
-- Employee Assistance Program's pages) and claims the /finance-office/benefits
-- section for analytics; the Employee Assistance Program's longer path still
-- wins for its own pages.

begin;

create temp table moved (id uuid, url text, prev text[]) on commit drop;
insert into moved values
  ('f37cd03f-111f-486b-a242-4695b8d1302f', 'https://www.browardschools.com/bcps-departments/academics/secondary-learning',
     array['/bcps-departments/secondary-learning', '/bcps-departments/applied-learning-academic-electives-specials-extra-curricular/drivers-education']),
  ('e07f7eda-fb6d-4a45-ac78-91e2c20272ab', 'https://www.browardschools.com/bcps-departments/academics/early-childhood-education',
     array['/bcps-departments/early-childhood-education']),
  ('d2ab5087-feb4-4a7c-8b15-dff6411f179f', 'https://www.browardschools.com/bcps-departments/academics/elementary-learning',
     array['/bcps-departments/elementary-learning']),
  ('9754d15d-2fc1-4b72-a47e-3e12ce3fedc1', 'https://www.browardschools.com/bcps-departments/academics/educational-assessment-analysis-research',
     array['/bcps-departments/educational-assessment-analysis-research']),
  ('5eef3c98-4383-4cda-9329-0c5d28f60f97', 'https://www.browardschools.com/bcps-departments/academics/career-technical-adult-community-education',
     array['/bcps-departments/career-technical-adult-education-ctace']),
  ('c0dbe821-67c8-45c9-9aa3-5f198998334b', 'https://www.browardschools.com/bcps-departments/office-of-student-services/student-services-mental-health',
     array['/bcps-departments/student-services', '/bcps-departments/mental-health-services']),
  ('52c2519e-ea32-494e-9c68-8fe03524bf34', 'https://www.browardschools.com/bcps-departments/office-of-communications/family-and-community-engagement-face',
     array['/bcps-departments/family-and-community-engagement-face']),
  ('b4c09347-ca9d-48b0-8bd5-a47e217cec11', 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/broward-county-schools-police-bcps-police',
     array['/bcps-departments/bcps-police']),
  ('3222fadb-d1a7-4995-bf1f-fa36e09ceebc', 'https://www.browardschools.com/bcps-departments/finance-office/benefits/overview',
     array['/bcps-departments/benefits-employment-services', '/bcps-departments/finance-office/benefits']),
  ('da4ecbc9-7240-4577-bd9d-be4594f36eed', 'https://www.browardschools.com/bcps-departments/facilities/sustainability-compliance',
     array['/bcps-departments/environmental-health-safety']),
  -- Address unchanged; old or extra sections only.
  ('85b788d0-f3be-4c6a-8909-b8dc1c077816', null, array['/bcps-departments/student-activities']),
  ('3e974651-7ed9-4bc5-908d-b086babb2d12', null, array['/bcps-departments/strategy-innovation/strategic-initiative-management']);

-- The audit's main page follows the address (keeping its results), unless
-- the new address is already one of the department's pages.
update bcps_site_pages p set url = m.url, last_seen_at = now()
from moved m join bcps_departments d on d.id = m.id
where m.url is not null and p.department_id = m.id and p.is_main
  and rtrim(p.url, '/') = rtrim(d.website_url, '/')
  and not exists (select 1 from bcps_site_pages q where q.department_id = m.id and rtrim(q.url, '/') = rtrim(m.url, '/'));

update bcps_departments d
set website_url = coalesce(m.url, d.website_url),
    previous_paths = (select array_agg(distinct x) from unnest(d.previous_paths || m.prev) x),
    updated_at = now()
from moved m where d.id = m.id;

commit;
