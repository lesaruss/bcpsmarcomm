-- Agenda builder (BCPS Document System, Phase 3, V 2026-10-28): each saved
-- agenda for a Playbook meeting. The agenda itself is filed as a Meeting
-- Record (briefings, record_slug); this row keeps its items so the next
-- agenda can tell when an item rolls to a third meeting in a row (it then goes
-- to the sponsor as a Concern to Watch). Service role only.
create table if not exists public.bcps_playbook_agendas (
  id uuid primary key default gen_random_uuid(),
  playbook_slug text not null,
  record_slug text,
  meeting_date date not null,
  meeting_label text not null default '',
  items jsonb not null default '[]'::jsonb,
  created_by_email text not null,
  revision_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bcps_playbook_agendas_slug_idx on public.bcps_playbook_agendas (playbook_slug, meeting_date desc, created_at desc);
alter table public.bcps_playbook_agendas enable row level security;
