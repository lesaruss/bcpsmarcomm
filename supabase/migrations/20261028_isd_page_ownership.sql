-- Information Systems web ownership (Sean, 2026-10-28).
--
-- The Information Systems division (ISD) keeps ONE page for the whole
-- division: an overview of its departments, with nothing for each department
-- to manage on its own. Application Services owns that page and Andrea Barton
-- is its WCM, so Application Services carries the division page's address.
-- The other ISD departments have no department page of their own. A WCM in
-- one of them can still own a single page; the first case is Ernesto Gonzalez
-- (Project Management Office), WCM for the Linewize page in Programs &
-- Services. bcps_page_wcm_assignments records that kind of ownership, which
-- did not exist before: a WCM responsible for a program or project page
-- rather than a department site.
--
-- The division page moved from /bcps-departments/information-technology to
-- /bcps-departments/information-systems; the old address is kept in
-- previous_paths so earlier traffic and old links are credited.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS public.bcps_page_wcm_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path text NOT NULL UNIQUE,
  page_title text NOT NULL,
  page_kind text NOT NULL CHECK (page_kind IN ('program', 'project', 'page')),
  department_id uuid REFERENCES public.bcps_departments(id),
  wcm_name text,
  wcm_email text,
  notes text,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bcps_page_wcm_assignments ENABLE ROW LEVEL SECURITY;

-- Application Services: the division page.
UPDATE public.bcps_departments
SET website_url = 'https://www.browardschools.com/bcps-departments/information-systems',
    previous_paths = ARRAY['/bcps-departments/information-technology'],
    notes = concat_ws(E'\n', nullif(notes, ''), 'Owns the main Information Systems (ISD) page for the whole division; Andrea Barton is its WCM (Sean, 2026-10-28).'),
    updated_at = now()
WHERE slug = 'application-services'
  AND website_url IS DISTINCT FROM 'https://www.browardschools.com/bcps-departments/information-systems';

-- The other ISD departments: no page of their own.
UPDATE public.bcps_departments
SET website_url = NULL,
    notes = concat_ws(E'\n', nullif(notes, ''), 'No department page of its own (Sean, 2026-10-28): the Information Systems division keeps one page, owned by Application Services. A page this department''s WCM keeps is recorded in bcps_page_wcm_assignments.'),
    updated_at = now()
WHERE slug IN ('data-intelligence', 'technology-support-services', 'infrastructure-services', 'technology-operations', 'information-security-assurance')
  AND website_url = 'https://www.browardschools.com/bcps-departments/information-technology';

-- Ernesto Gonzalez owns the Linewize page.
INSERT INTO public.bcps_page_wcm_assignments (page_path, page_title, page_kind, department_id, wcm_name, wcm_email, notes, added_by)
SELECT '/directory/programs-and-services-63/linewize-parent', 'Linewize', 'program', d.id, 'Ernesto Gonzalez', 'ernesto.gonzalez@browardschools.com',
       'Programs & Services page kept by the Project Management Office''s WCM (Sean, 2026-10-28).', 'logan'
FROM public.bcps_departments d
WHERE d.slug = 'project-management-office'
ON CONFLICT (page_path) DO NOTHING;

UPDATE public.bcps_wcm_roster_members m
SET sub_department = 'Linewize page (Programs & Services)'
FROM public.bcps_wcm_roster r, public.bcps_departments d
WHERE r.id = m.roster_id AND d.id = r.matched_department_id AND d.slug = 'project-management-office'
  AND lower(m.wcm_email) = 'ernesto.gonzalez@browardschools.com' AND m.sub_department IS NULL;

-- Andrea Barton was on the Application Services roster twice (approved
-- 2026-09-16 and again 2026-09-18). Keep the first.
DELETE FROM public.bcps_wcm_roster_members m
USING public.bcps_wcm_roster_members keep
WHERE lower(m.wcm_email) = 'andrea.barton@browardschools.com'
  AND lower(keep.wcm_email) = 'andrea.barton@browardschools.com'
  AND keep.roster_id = m.roster_id
  AND keep.added_at < m.added_at;
