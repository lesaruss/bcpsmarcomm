-- Complete a Playbook item from the document (V, 2026-10-28). The owner of a
-- Work Queue or Action Items entry, or a superadmin, writes a response and
-- attaches files; this table is the record of each completion, and the files
-- live in the private playbook-attachments bucket. Service role only: the
-- /api/bcps/playbook-items route checks who may complete or download.
insert into storage.buckets (id, name, public, file_size_limit)
values ('playbook-attachments', 'playbook-attachments', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.bcps_playbook_completions (
  id uuid primary key default gen_random_uuid(),
  playbook_slug text not null,
  item_kind text not null check (item_kind in ('queue', 'action')),
  item_text text not null,
  completed_lines jsonb not null default '[]'::jsonb,
  response text not null default '',
  files jsonb not null default '[]'::jsonb,
  completed_by_email text not null,
  completed_by_name text,
  revision_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bcps_playbook_completions_slug_idx on public.bcps_playbook_completions (playbook_slug, created_at desc);
alter table public.bcps_playbook_completions enable row level security;
