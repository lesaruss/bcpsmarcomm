-- Team input on a Playbook (V, 2026-10-28): any reader adds input to an open
-- question, a Missing or Draft section, or the page in general. It shows on
-- the page as team input until a lead (metadata.transcript_admins) or the
-- superadmin accepts or dismisses it. This table is the record; files live in
-- the private playbook-attachments bucket. Service role only.
create table if not exists public.bcps_playbook_inputs (
  id uuid primary key default gen_random_uuid(),
  playbook_slug text not null,
  target_kind text not null check (target_kind in ('question', 'section', 'general')),
  target_text text not null default '',
  body text not null default '',
  files jsonb not null default '[]'::jsonb,
  author_email text not null,
  author_name text,
  status text not null default 'new' check (status in ('new', 'accepted', 'dismissed')),
  decided_by_email text,
  decided_at timestamptz,
  revision_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bcps_playbook_inputs_slug_idx on public.bcps_playbook_inputs (playbook_slug, created_at desc);
alter table public.bcps_playbook_inputs enable row level security;
