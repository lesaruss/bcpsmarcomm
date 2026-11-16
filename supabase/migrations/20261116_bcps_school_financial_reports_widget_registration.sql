-- School Financial Reports: Widgets hub registration and the page object that carries
-- the edit ACL. Apply ONLY once /embeds/school-financial-reports.html is live on
-- production, so the hub never lists a widget whose preview 404s.
INSERT INTO public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
SELECT 'school-financial-reports', 'School Financial Reports',
  'Embeddable list of each school''s Florida DOE School Financial Report for 2023-24 and 2024-25, which OptiSchool no longer provides. Search by school name or location number, sort by either, and filter by school year.',
  '/embeds/school-financial-reports.html', 'school-financial-reports', 10
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_widgets WHERE slug = 'school-financial-reports');

INSERT INTO public.acl_objects (brand, kind, slug, title, visibility)
SELECT 'bcps', 'page', 'school-financial-reports', 'School Financial Reports', 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND kind = 'page' AND slug = 'school-financial-reports');
