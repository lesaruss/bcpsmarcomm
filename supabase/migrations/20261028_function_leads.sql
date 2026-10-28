-- Function leads count as directors (Sean, 2026-10-28).
--
-- "Director" on the platform means the top person for a department OR a
-- function within one, whatever their title: a Coordinator who runs a
-- program counts the same as a Director who runs a department. First case:
-- Deanna Greist, Coordinator, Home School Education, the lead of that program
-- inside Magnet & Innovative Programs (whose director is Dr. Kassandra Fried).
--
-- bcps_page_wcm_assignments already records who keeps a program or project
-- page; is_lead marks that this person also leads the function, and
-- lead_title keeps their real title. Function leads get the director
-- invitation, scoped to their function. Safe to run twice.

ALTER TABLE public.bcps_page_wcm_assignments
  ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_title text;

UPDATE public.bcps_page_wcm_assignments
SET is_lead = true, lead_title = 'Coordinator, Home School Education'
WHERE page_path = '/bcps-departments/academics/magnet-programs/home-school-education'
  AND NOT is_lead;
