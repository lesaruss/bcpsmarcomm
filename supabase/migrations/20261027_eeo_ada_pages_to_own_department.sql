-- EEO / ADA Compliance pages out of Labor Relations' audit (Sean, Oct 27 Hot
-- Lab with Patricia Sapp). The EEO pages live under the Labor Relations path
-- on browardschools.com, so Labor Relations' left-menu discovery picked them
-- up. EEO / ADA Compliance is its own department with its own WCM (Marcia
-- Dixon), so the pages and their audit history move there.
--
-- Labor Relations keeps its copies as inactive rows: discovery skips an
-- inactive page, so its next audit does not add them back. EEO gets its own
-- rows and the audit results and findings already run on them. EEO's address
-- on file (/human-resources/equal-educational-opportunities/overview) is a
-- 404; its live page under /labor-relations/ becomes its main page.

begin;

-- EEO's dead main page is retired; its one result stays as history.
update bcps_site_pages set active = false, is_main = false
where department_id = '77f496e2-108c-4eb5-acb0-660985d5d8ff'
  and url = 'https://www.browardschools.com/bcps-departments/human-resources/equal-educational-opportunities/overview';

update bcps_departments
set website_url = 'https://www.browardschools.com/bcps-departments/human-resources/labor-relations/equal-educational-opportunities', updated_at = now()
where id = '77f496e2-108c-4eb5-acb0-660985d5d8ff';

create temp table eeo_move on commit drop as
select p.id as old_id, gen_random_uuid() as new_id, p.url, p.title,
       p.url = 'https://www.browardschools.com/bcps-departments/human-resources/labor-relations/equal-educational-opportunities' as is_main,
       p.created_at, p.last_seen_at
from bcps_site_pages p
where p.department_id = '3072bd04-03da-4b0f-ae8d-1a6c81206035'
  and p.active
  and p.url like 'https://www.browardschools.com/bcps-departments/human-resources/labor-relations/equal-educational-opportunities%';

insert into bcps_site_pages (id, department_id, url, title, is_main, source, active, created_at, last_seen_at, added_by)
select new_id, '77f496e2-108c-4eb5-acb0-660985d5d8ff', url, case when is_main then 'EEO / ADA Compliance' else title end,
       is_main, case when is_main then 'main' else 'left_nav' end, true, created_at, last_seen_at, 'logan'
from eeo_move;

-- Audit history follows the page.
update bcps_audit_findings f set department_id = '77f496e2-108c-4eb5-acb0-660985d5d8ff'
from bcps_audit_results r join eeo_move m on m.old_id = r.site_page_id
where f.audit_result_id = r.id;

update bcps_audit_results r set department_id = '77f496e2-108c-4eb5-acb0-660985d5d8ff', site_page_id = m.new_id
from eeo_move m where r.site_page_id = m.old_id;

update bcps_site_pages p set active = false from eeo_move m where p.id = m.old_id;

-- Recorded as settled reclassifications, so the move shows in the review trail.
insert into bcps_page_reclass_requests (department_id, site_page_id, note, requested_by, requested_at, status, moved_to, resolved_by, resolved_at)
select '3072bd04-03da-4b0f-ae8d-1a6c81206035', old_id, 'EEO / ADA Compliance is its own department (Sean, Oct 27 Hot Lab).',
       'sean.russell@browardschools.com', now(), 'moved', '77f496e2-108c-4eb5-acb0-660985d5d8ff', 'logan', now()
from eeo_move;

commit;
