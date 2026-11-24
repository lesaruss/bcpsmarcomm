-- Applied 2026-11-24 through execute_sql (Sean + Vanessa Deslandes, banner tool session).
-- The banner tool's school picker listed 227 locations; the District Web Team covers the
-- schools with Finalsite websites. Archive the closed / non-Finalsite locations and the
-- duplicate Henry D. Perry row (the real one, 0592, stays assigned to Jeune Tilus).
update public.bcps_school_directory set is_archived = true, updated_at = now()
where loc_no in ('3921','3941','3951','1191','3571','0551','0601','1171','6501') and not is_archived;

insert into public.bcps_assignment_tags (assignment_slug, status, priority, title_override, description_override, lead_override, playbook_url, added_at, updated_at)
select 'non-finalsite-district-sites', 'pending', 'high',
 'District sites outside Finalsite: who covers ADA and web best practices',
 'From the Nov 24 banner tool session (Sean, Vanessa Deslandes): the District Web Team is assigned only to the 217 schools on Finalsite. Broward Virtual, the technical colleges (Atlantic Technical College, Sheridan Technical College and others) and Community Schools run their own websites, are still part of the District, and are the District''s responsibility if flagged for ADA, but no one is sharing best practices with them. Bring to the next District Web Team meeting: decide who owns these sites, how we reach their web contacts, and whether they get the audit. Tricia leads, Vanessa and Sean support.',
 'Tricia / Vanessa', null, now(), now()
where not exists (select 1 from public.bcps_assignment_tags where assignment_slug = 'non-finalsite-district-sites');
