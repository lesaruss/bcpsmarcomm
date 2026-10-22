-- In-place Playbook editing by project leads (Sean, 2026-10-22). Every save
-- through /api/bcps/playbook-edit copies the page it replaces here first, so
-- an edit can always be rolled back. Service role only.
create table if not exists public.bcps_doc_revisions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  content text not null,
  replaced_by_email text,
  replaced_at timestamptz not null default now()
);
create index if not exists bcps_doc_revisions_slug_idx on public.bcps_doc_revisions (slug, replaced_at desc);
alter table public.bcps_doc_revisions enable row level security;
