-- Each department audits only its own pages (Sean, Oct 27 Hot Lab: WCMs were
-- seeing other departments' pages mixed into theirs). Pages that belong to
-- another department are retired here as inactive rows, which discovery skips
-- on the next audit; their results stay as history, and each page is still
-- audited under the department that owns it.
--
--  Bilingual / ESOL   its address (/bilingualesol) now redirects to the
--                     Departments index, so discovery picked up Career,
--                     Technical & Adult Education and Early Childhood pages.
--                     Its live page /academics/bilingualesol becomes its main
--                     page and address.
--  Marketing & Strategic Communications  the Graphics page is Graphics'.
--  Safety Technology  its address is the division homepage; the Safety &
--                     Security Operations, Emergency Management, Police and
--                     Behavioral Threat Management pages are theirs.

begin;

-- Magnet & Innovative Programs moved under /academics/; its old address
-- was a 404 and its analytics never matched.
update bcps_departments
set website_url = 'https://www.browardschools.com/bcps-departments/academics/magnet-programs', updated_at = now()
where id = 'b272b4d5-a9b1-4e19-bdd8-49a5838e9848';

update bcps_departments
set website_url = 'https://www.browardschools.com/bcps-departments/academics/bilingualesol', updated_at = now()
where id = 'bb2bde75-4380-4be1-9d1c-308b29379bf3';

update bcps_site_pages set active = false, is_main = false
where department_id = 'bb2bde75-4380-4be1-9d1c-308b29379bf3' and active
  and (url like '%/academics/career-technical-adult-community-education%'
    or url like '%/academics/early-childhood-education%'
    or rtrim(url, '/') in ('https://www.browardschools.com/bcps-departments/academics',
                           'https://www.browardschools.com/bcps-departments/bilingualesol'));

update bcps_site_pages set is_main = true, source = 'main'
where department_id = 'bb2bde75-4380-4be1-9d1c-308b29379bf3' and active
  and rtrim(url, '/') = 'https://www.browardschools.com/bcps-departments/academics/bilingualesol';

update bcps_site_pages set active = false
where department_id = 'b9655655-5124-4b0b-9074-c5fdf5911c03' and active
  and url like 'https://www.browardschools.com/bcps-departments/office-of-communications/marketing-communications/graphics%';

update bcps_site_pages set active = false
where department_id = '487cece3-3fe7-4395-bacd-6d8425238221' and active
  and (url like 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/department-of-safety-security%'
    or url like 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/emergency-management%'
    or url like 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/broward-county-schools-police-bcps-police%'
    or url like 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/behavioral-threat-management%');

insert into bcps_audit_queue (kind, department_id, run_month, requested_by) values
  ('site', 'bb2bde75-4380-4be1-9d1c-308b29379bf3', '2026-10-01', 'ownership-cleanup-2026-10-27'),
  ('site', 'b9655655-5124-4b0b-9074-c5fdf5911c03', '2026-10-01', 'ownership-cleanup-2026-10-27'),
  ('site', '487cece3-3fe7-4395-bacd-6d8425238221', '2026-10-01', 'ownership-cleanup-2026-10-27');

commit;
