-- Director launch (Sean, 2026-10-28).
--
-- 1. bcps_director_invites: who has been sent the BCPS MarComm director
--    invitation, so the SuperAdmin panel can show it and never double-send by
--    accident. Written only by /api/bcps/director-invite with the service key;
--    RLS on with no policies keeps it off the public API.
-- 2. The Directors group can open every Hot Lab for Department WCMs, so
--    directors see what the District Web Team covers with their WCMs.
--    The invitation adds each director to that group.
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS public.bcps_director_invites (
  email text PRIMARY KEY,
  name text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  new_account boolean,
  sent_by text
);
ALTER TABLE public.bcps_director_invites ENABLE ROW LEVEL SECURITY;

INSERT INTO public.acl_grants (object_id, subject_type, subject_id, role)
SELECT o.id, 'group', g.id, 'view'
FROM public.acl_objects o
JOIN public.acl_groups g ON g.brand = 'bcps' AND g.slug = 'directors'
WHERE o.brand = 'bcps' AND o.kind = 'document_series' AND o.slug = 'hot-lab-department-wcms'
  AND NOT EXISTS (SELECT 1 FROM public.acl_grants x WHERE x.object_id = o.id AND x.subject_type = 'group' AND x.subject_id = g.id);
