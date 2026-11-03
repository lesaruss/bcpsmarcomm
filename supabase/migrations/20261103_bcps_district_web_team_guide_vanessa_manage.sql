-- Vanessa Deslandes becomes admin (manage) on the District Web Team Guide
-- (Sean, 2026-11-03). She already reads it through the dwt group; this adds
-- the direct manage grant. Applied live 2026-11-03.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id::text, 'manage'
from public.acl_objects o
join auth.users u on lower(u.email) = 'vanessa.deslandes@browardschools.com'
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'district-web-team'
on conflict (object_id, subject_type, subject_id) do update set role = 'manage';
