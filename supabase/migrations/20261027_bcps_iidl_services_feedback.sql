-- II&DL Services Directory, Alex Macri feedback of 2026-10-20 (Sean, 2026-10-27).
-- Applied to project fwbhwfxpncrsfhttimna one statement per execute_sql call
-- (error_registry SUPABASE-MCP-EXECUTE-SQL-TIMEOUT-ON-HTML-LITERALS).
--
-- The directory is an internal catalog for schools and Area Directors, not a
-- family resource, so the audience values become school (support a school
-- requests) and staff (an individual employee's own question, e.g. LAB).
-- 'family' and 'district' are retired; 'all' stays for services that are both.

ALTER TABLE public.bcps_iidl_services DROP CONSTRAINT IF EXISTS bcps_iidl_services_audience_check;
UPDATE public.bcps_iidl_services SET audience = 'school' WHERE audience IN ('family', 'district');
UPDATE public.bcps_iidl_services SET audience = 'staff' WHERE name IN (
  'AI Learning Pathways (Coming Soon)', 'AI Staff Hub', 'Broward Virtual University (BVU) & Endorsement Courses',
  'District Professional Learning Calendar & Scheduling', 'Inservice Credit & Transcript Support',
  'Learning Across Broward (LAB) Administration & Support', 'Mandatory Compliance Learning & Monitoring',
  'Substitute Support');
ALTER TABLE public.bcps_iidl_services ADD CONSTRAINT bcps_iidl_services_audience_check CHECK (audience IN ('school', 'staff', 'all'));

-- Item 2: the team asked to remove Interactive Videoconferencing altogether.
DELETE FROM public.bcps_iidl_services WHERE name = 'Interactive Videoconferencing';

-- Item 1: the Rev10 Services Description was the Canvas text; use the row's
-- Brief Description until II&DL sends a service-specific one.
UPDATE public.bcps_iidl_services SET
  description = 'Provides district-approved print and digital materials that help educators deliver the curriculum and support student learning.',
  review_note = 'Description is the unit-wide Brief Description from Rev10. A Material Adoption specific description would be better when II&DL has one.',
  updated_at = now()
WHERE name = 'Material Adoption Information';

-- Item 3: II&DL keeps both Microsoft 365 rows as they are.
UPDATE public.bcps_iidl_services SET review_note = NULL, updated_at = now()
WHERE name = 'Microsoft 365 Productivity Applications Support';

-- Book button to the main II&DL Bookings page; the team is adding the entry there.
UPDATE public.bcps_iidl_services SET
  booking_url = 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled=true',
  updated_at = now()
WHERE name = 'Parent University/Town Hall Meetings Setup';

-- Item 4: no unit page yet, so link the II&DL department page. The summary is
-- a draft for II&DL to confirm or edit in the Widgets hub.
UPDATE public.bcps_iidl_units SET
  page_url = 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning',
  summary = 'Supports schools in using artificial intelligence responsibly and effectively, and in building strong digital citizenship.',
  updated_at = now()
WHERE slug = 'ai-digital-citizenship';
