-- Access object for campaign reports at /campaigns/[slug].
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-22.
--
-- Sean raised public viewing for these reports and then ruled it out in the
-- same breath: they go to the Office of Communications plus named individuals,
-- and are explicitly MORE limited than the rest of the Analytics page.
--
-- visibility is 'restricted', never 'public'. The gate that reads this row
-- (src/lib/bcps-campaign-access.ts) is default deny, so an empty grant list
-- means nobody rather than everybody. That is the opposite of checkDocAccess,
-- which is public-unless-recipients-exist and is deliberately NOT used here.
--
-- Widening or narrowing access is a data change from here on, never a code
-- change: adding a person is one INSERT into acl_grants against this object.
insert into public.acl_objects (brand, kind, slug, title, visibility, sensitive, description, section)
values ('bcps', 'document_series', 'campaign-reports', 'Campaign Reports', 'restricted', true,
        'Live marketing campaign analytics reports. Access is deliberately narrower than the rest of the Analytics page: Office of Communications plus named individuals, and BCPS admins.',
        'Analytics')
on conflict do nothing;

-- The Office of Communications group. Measured at the time of writing: 3
-- members. BCPS admins and superadmins get in via acl_member_roles without
-- needing a grant, matching every other admin check in this codebase.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.slug = 'campaign-reports' and o.brand = 'bcps' and g.slug = 'ooc'
on conflict do nothing;

-- To grant one person directly (no group), insert a user grant:
--   insert into public.acl_grants (object_id, subject_type, subject_id, role)
--   select o.id, 'user', u.id, 'view'
--   from public.acl_objects o, auth.users u
--   where o.slug = 'campaign-reports' and o.brand = 'bcps'
--     and lower(u.email) = lower('<their district email>')
--   on conflict do nothing;
