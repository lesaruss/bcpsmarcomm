-- Glennika D. Gordon, 2026-11-03: her section is now Intergovernmental
-- Coordination (was Growth Management). The prm_growthmanagement inbox is
-- unchanged. Updates the Widgets hub card and the Documents catalog entries
-- for the Public School Impact Application; the form and emails are code.
update public.bcps_widgets
set description = 'Intergovernmental Coordination intake for Public School Impact Applications (Form 4726): applicants pay on the e-store, fill in the application and upload the receipt, site plan and survey. Staff track each one to the SCAD letter.'
where slug = 'school-impact-application';

update public.acl_objects
set description = replace(description, 'Growth Management''s', 'Intergovernmental Coordination''s')
where brand = 'bcps' and kind = 'document' and slug = 'school-impact-application';
