-- Leadership View group and Manny's queued access (Sean, 2026-10-27).
--
-- A view-only group for District leaders who follow the platform without
-- running a website: full Analytics, the Broward Powered by AI tile and its
-- Progress Tracker on the Documents page, and the Platform Ownership
-- Migration playbook. Paired with Department Oversight, which gives the
-- director dashboard across every department. Neither group can approve or
-- change anything: roster and audit actions check bcps_departments
-- director_email / executive_emails, not group membership.
--
-- Manuel Castaneda (Executive Director, Enterprise Analytics and
-- Intelligence) has no account yet, so his memberships are queued in
-- bcps_pending_group_members and claimed on his first sign-in.
-- Applied through a one-time edge function (ops-supabase-write-once-function).
-- Every statement is safe to run twice.

INSERT INTO public.acl_groups (brand, slug, name, description)
SELECT 'bcps', 'leadership-view', 'Leadership View',
       'View-only District leaders who follow the platform: Analytics, Broward Powered by AI and its tracker, and the Platform Ownership Migration playbook (Sean, 2026-10-27).'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_groups WHERE brand = 'bcps' AND slug = 'leadership-view');

INSERT INTO public.acl_objects (brand, kind, slug, title, visibility, doc_url, doc_type, doc_date, icon, section, featured, project, description)
SELECT 'bcps', 'document', 'bcps-platform-ownership-migration', 'BCPS Platform Ownership Migration', 'restricted',
       '/playbooks/bcps-platform-ownership-migration', 'Playbook', 'October 27, 2026', '📘', 'documents', false, 'Platform Ownership',
       'Moving bcpsmarcomm.com and browardschools.ai onto District accounts: the Copilot test, the cost check, who does what, and the timeline.'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND slug = 'bcps-platform-ownership-migration');

INSERT INTO public.acl_grants (object_id, subject_type, subject_id, role)
SELECT o.id, 'group', g.id, 'view'
FROM public.acl_objects o
JOIN public.acl_groups g ON g.brand = 'bcps' AND g.slug = 'leadership-view'
WHERE o.brand = 'bcps'
  AND ((o.kind = 'page' AND o.slug = 'analytics')
    OR (o.kind = 'document' AND o.slug IN ('bcps-ai-progress-tracker', 'bcps-powered-by-ai-site', 'bcps-platform-ownership-migration')))
  AND NOT EXISTS (SELECT 1 FROM public.acl_grants x WHERE x.object_id = o.id AND x.subject_type = 'group' AND x.subject_id = g.id);

INSERT INTO public.bcps_pending_group_members (email, group_id, added_by)
SELECT 'manuel.castaneda@browardschools.com', g.id, 'logan'
FROM public.acl_groups g
WHERE g.brand = 'bcps' AND g.slug IN ('department-oversight', 'leadership-view')
  AND NOT EXISTS (SELECT 1 FROM public.bcps_pending_group_members p WHERE lower(p.email) = 'manuel.castaneda@browardschools.com' AND p.group_id = g.id);
