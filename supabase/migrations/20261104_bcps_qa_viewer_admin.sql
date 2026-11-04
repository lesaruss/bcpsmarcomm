-- View-only QA admin (Sean, 2026-11-04).
-- vegan@lesaruss.com is the QA account stations sign in as headlessly
-- (canon agent-headless-page-verification). Give it the bcps admin role so it
-- sees what an admin sees. It stays read-only because src/middleware.ts
-- refuses every non-GET/HEAD/OPTIONS request from this account.
-- Apply only once that middleware is live on production.
insert into public.acl_member_roles (user_id, brand, role)
select id, 'bcps', 'admin'
from auth.users
where email = 'vegan@lesaruss.com'
  and not exists (
    select 1 from public.acl_member_roles m
    where m.user_id = auth.users.id and m.brand = 'bcps'
  );
