-- Behavioral Threat Management audits its own page (Sean, Oct 27 Hot Lab).
-- Its address on file was the Safety, Security & Emergency Preparedness
-- division homepage, so its audit covered all 23 division pages (Emergency
-- Management, Police, Safety & Security Operations, careers). Those pages are
-- retired here as inactive rows (results kept as history; the pages are
-- audited under their own departments), and BTM's live page becomes its main
-- page.

begin;

update bcps_site_pages set active = false
where department_id = '17e92a60-f000-4933-bb9d-efb0154a9bee' and active;

update bcps_departments
set website_url = 'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/behavioral-threat-management', updated_at = now()
where id = '17e92a60-f000-4933-bb9d-efb0154a9bee';

insert into bcps_site_pages (department_id, url, title, is_main, source, active, added_by)
values ('17e92a60-f000-4933-bb9d-efb0154a9bee',
        'https://www.browardschools.com/bcps-departments/safety-security-and-emergency-preparedness/behavioral-threat-management',
        'Behavioral Threat Management', true, 'main', true, 'logan');

insert into bcps_audit_queue (kind, department_id, run_month, requested_by)
values ('site', '17e92a60-f000-4933-bb9d-efb0154a9bee', '2026-10-01', 'btm-own-page-2026-10-27');

commit;
