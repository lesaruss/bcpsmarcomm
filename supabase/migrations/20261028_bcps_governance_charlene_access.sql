-- Charlene A. Collins added to the Website Governance Plan and its October 7 meeting notes
-- (V, 2026-10-27), so the links in the School Support Plan open for her. Applied via execute_sql.
insert into public.bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
select s.slug, 'Charlene A. Collins', 'charlene.collins@browardschools.com', 'auto'
from (values ('bcps-website-governance-plan-2026-06-10'), ('bcps-website-governance-plan-2026-06-10-meeting-2026-10-07')) as s(slug)
where not exists (select 1 from public.bcps_brief_recipients r
                  where r.brief_slug = s.slug and lower(r.attendee_email) = 'charlene.collins@browardschools.com');
