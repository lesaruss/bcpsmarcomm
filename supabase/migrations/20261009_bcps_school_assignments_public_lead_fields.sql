-- Find Your District Web Team Lead embed fix (2026-10-09).
-- The 2026-10-09 security review narrowed bcps_school_assignments to
-- authenticated reads (lead_email must not be bulk-readable) and added the
-- anon-readable view bcps_school_assignments_public without the email. The
-- embed reads anonymously, so it needs the lead's display fields on the view.
-- Append them here, never the email. Applied live via the Supabase MCP.
CREATE OR REPLACE VIEW public.bcps_school_assignments_public
WITH (security_invoker = false) AS
SELECT a.loc_no,
       a.school_name,
       a.display_name,
       a.school_level,
       a.region,
       a.no_wcm,
       a.school_year,
       a.updated_at,
       l.full_name AS lead_name,
       l.title AS lead_title,
       l.bio AS lead_bio,
       l.photo_url AS lead_photo_url,
       l.sort_order AS lead_order
FROM public.bcps_school_assignments a
LEFT JOIN public.bcps_support_leads l ON l.email = a.lead_email AND l.active;

GRANT SELECT ON public.bcps_school_assignments_public TO anon, authenticated;
