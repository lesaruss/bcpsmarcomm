-- Proud Points as an embed for everyone (Sean, 2026-10-08): Vanessa puts it in
-- the Finalsite WCM Community page and announces it in a communique, so any
-- school WCM can use it without a bcpsmarcomm.com account.
--
-- In the embed a person proves who they are with a one-time code sent to
-- their @browardschools.com address (the old Microsoft Form required a
-- district Microsoft sign-in, so this keeps the same bar). There is no
-- auth.users row for them, so submissions and photos are owned by email.

-- Owned by email: the user id is kept when the submitter is signed in.
alter table public.bcps_proud_point_submissions alter column wcm_user_id drop not null;
drop index if exists public.bcps_pp_one_draft;
create unique index if not exists bcps_pp_one_draft_email
  on public.bcps_proud_point_submissions (lower(wcm_email), school_location_nbr) where status = 'draft';
create index if not exists bcps_pp_sub_email_idx on public.bcps_proud_point_submissions (lower(wcm_email));

alter table public.bcps_proud_point_photos alter column wcm_user_id drop not null;
alter table public.bcps_proud_point_photos add column if not exists owner_email text;

-- One-time sign-in codes for the embed. Only a hash of the code is stored.
create table if not exists public.bcps_proud_point_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bcps_pp_codes_email_idx on public.bcps_proud_point_codes (email, created_at desc);
alter table public.bcps_proud_point_codes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bcps_proud_point_codes' and policyname = 'bcps_proud_point_codes_service_role_only') then
    create policy bcps_proud_point_codes_service_role_only on public.bcps_proud_point_codes
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

-- In the app, open to every member again (the embed is open to every
-- district email, so the app page should not be narrower).
update public.acl_objects set visibility = 'public', updated_at = now()
where brand = 'bcps' and kind = 'page' and slug in ('proud-points', 'my-submissions');

-- Listed in the Widgets hub, where the team copies embed code for Finalsite.
insert into public.bcps_widgets (slug, title, description, preview_path, sort_order)
select 'proud-points-embed', 'Proud Points Submission',
  'School WCMs submit their homepage Proud Points: six to start, or replace one. Sign in with a code sent to a district email; every submission goes to the District Web Team review queue.',
  '/embed/proud-points', 5
where not exists (select 1 from public.bcps_widgets where slug = 'proud-points-embed');
