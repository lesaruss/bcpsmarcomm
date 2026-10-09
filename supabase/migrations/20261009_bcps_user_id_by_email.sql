-- "View as person" (Sean, 2026-10-09): the SuperAdmin previews the site as a
-- specific person by email. Service role only; the routes check the caller
-- is SuperAdmin before using it.
create or replace function public.bcps_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) order by created_at limit 1
$$;
revoke all on function public.bcps_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.bcps_user_id_by_email(text) to service_role;
