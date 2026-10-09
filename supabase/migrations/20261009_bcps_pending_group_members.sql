-- Group access set up for someone before they have an account (Sean,
-- 2026-10-09). /api/bcps/my-access turns each row for the signed-in email
-- into an acl_group_members row on first sign-in, then deletes it. Emails
-- are stored lowercase. Service role only.
create table if not exists public.bcps_pending_group_members (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  group_id uuid not null references public.acl_groups(id) on delete cascade,
  added_by text,
  created_at timestamptz not null default now(),
  unique (email, group_id)
);
alter table public.bcps_pending_group_members enable row level security;
