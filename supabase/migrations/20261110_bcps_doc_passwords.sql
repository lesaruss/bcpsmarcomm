-- Password access for BCPS documents (Sean, 2026-11-10).
-- A document at /playbooks/[playbook] or /playbooks/[playbook]/[doc] can carry
-- one password. Anyone not signed in (or signed in without access) can enter
-- it for 24 hours of access to that one document; signing in still works.
-- Only a salted scrypt hash is stored. Row security is on with no policies,
-- so only the server (service role) can read or write this table.

create table if not exists public.bcps_doc_passwords (
  slug text primary key,
  password_hash text not null,
  set_by text,
  failed_attempts integer not null default 0,
  failed_window_start timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bcps_doc_passwords enable row level security;

revoke all on public.bcps_doc_passwords from anon, authenticated;

comment on table public.bcps_doc_passwords is
  'Per-document password for BCPS docs (Sean, 2026-11-10). Hash only; service role only. A correct password gives a signed 24-hour pass cookie for that slug.';
