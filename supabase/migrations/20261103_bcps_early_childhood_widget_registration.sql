-- Early Childhood Programs Directory: Widgets hub registration and the page object
-- that carries the edit ACL (same shape as iidl-services-directory and
-- charter-school-directory). Apply ONLY once /embeds/early-childhood-programs.html
-- is live on production, so the hub never lists a widget whose preview 404s.
INSERT INTO public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
SELECT 'early-childhood-programs', 'Early Childhood Programs Directory',
  'Embeddable directory of Early Head Start, Head Start, and VPK schools. Families filter by program or city, see free or tuition-supported at a glance, and find the nearest school to an address.',
  '/embeds/early-childhood-programs.html', 'early-childhood-programs', 8
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_widgets WHERE slug = 'early-childhood-programs');

INSERT INTO public.acl_objects (brand, kind, slug, title, visibility)
SELECT 'bcps', 'page', 'early-childhood-programs', 'Early Childhood Programs Directory', 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND kind = 'page' AND slug = 'early-childhood-programs');
