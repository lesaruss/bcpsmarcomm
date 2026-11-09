-- District Software Inventory: Widgets hub registration and the page object that
-- carries the edit ACL. Apply ONLY once /embeds/software-inventory.html is live on
-- production, so the hub never lists a widget whose preview 404s.
INSERT INTO public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
SELECT 'software-inventory', 'District Software Inventory',
  'Embeddable list of the instructional software the district owns and uses, from the Office of Academics master list. Search by program or vendor and filter by subject, department, and grade level.',
  '/embeds/software-inventory.html', 'software-inventory', 9
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_widgets WHERE slug = 'software-inventory');

INSERT INTO public.acl_objects (brand, kind, slug, title, visibility)
SELECT 'bcps', 'page', 'software-inventory', 'District Software Inventory', 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND kind = 'page' AND slug = 'software-inventory');
