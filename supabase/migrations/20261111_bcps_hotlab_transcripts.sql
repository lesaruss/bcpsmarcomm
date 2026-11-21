-- Hot Lab transcripts kept next to the attendance, so speaker credit can be checked and redone (Sean, 2026-11-10).
-- Applied through apply_migration. The transcripts themselves (Aug 27, Oct 22, Nov 3, Nov 5, Nov 10 so far) were
-- loaded through the one-time function ve-once-hotlab-transcripts (now a 410 stub) and are not in this public repo.
-- Speaker credit added the same day from the Aug 27 and Oct 22 transcripts (direct update, staff data not repeated here).
create table if not exists public.bcps_hotlab_transcripts (
  event_date date primary key,
  source_name text,
  vtt text not null,
  speakers text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bcps_hotlab_transcripts is 'Teams transcripts (.vtt) of the Department WCM Hot Labs, kept so speaker credit on the leaderboard (bcps_hotlab_attendance.spoke) can always be checked and redone (Sean, 2026-11-10). Staff speech: service role only, never in the public repo.';
alter table public.bcps_hotlab_transcripts enable row level security;
