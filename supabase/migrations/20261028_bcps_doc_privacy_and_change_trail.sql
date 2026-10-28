-- BCPS Document System, Phase 3 (V, 2026-10-28): consent, the content stop and
-- the change trail.
--
-- Consent: a Playbook transcript upload records that the lead confirmed
-- everyone in the meeting knew it was recorded (Florida generally requires
-- all-party consent). Content stop: before anything is summarized the
-- transcript is screened; a transcript about a named student, a student ID,
-- a personnel matter or a legal matter is flagged instead of summarized.
alter table public.bcps_meeting_uploads add column if not exists consent_confirmed_at timestamptz;
alter table public.bcps_meeting_uploads add column if not exists consent_confirmed_by text;
alter table public.bcps_meeting_uploads add column if not exists source_name text;
alter table public.bcps_meeting_uploads add column if not exists screen jsonb;
alter table public.bcps_meeting_uploads drop constraint if exists bcps_meeting_uploads_status_check;
alter table public.bcps_meeting_uploads add constraint bcps_meeting_uploads_status_check
  check (status in ('proposed', 'applied', 'discarded', 'failed', 'flagged'));

-- Change trail: one row per change to a BCPS Playbook or doc made through the
-- platform. Who did it, from what source (file, upload, the transcript lines
-- each item rests on), the AI model when one drafted it, the revision that
-- holds the content before and a hash of the content after, whether a person
-- approved it, and what the reviewer left out. Service role only; nothing is
-- ever deleted.
create table if not exists public.bcps_doc_change_log (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  action text not null,
  actor_email text not null,
  approved_by_email text,
  auto_applied boolean not null default false,
  model text,
  source jsonb not null default '{}'::jsonb,
  summary text not null default '',
  unticked jsonb not null default '[]'::jsonb,
  revision_id uuid,
  after_md5 text,
  created_at timestamptz not null default now()
);
create index if not exists bcps_doc_change_log_slug_idx on public.bcps_doc_change_log (slug, created_at desc);
alter table public.bcps_doc_change_log enable row level security;
