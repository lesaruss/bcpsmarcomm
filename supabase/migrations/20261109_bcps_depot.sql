-- The Depot (Sean, 2026-11-09): BCPS MarComm's own studio for videos and other
-- media made of numbered tiles, the lookbook format from the HQ podcast studio
-- (lesaruss-hq components/branddesk/PodcastRoom.tsx), kept separate from
-- BrandDesk. A project is a run of tiles; each tile has its stills, its script
-- and its voice line, and is approved on its own. The play-through previews the
-- approved tiles in order; the finished file sits on the project.
--
-- Files live in public buckets and are stored as "<bucket>/<path>".
-- RLS on, no policies: every read and write goes through /api/bcps/depot,
-- which is SuperAdmin only.

create table if not exists public.bcps_depot_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  kind text not null default 'video',            -- video for now; other media later
  audience text,                                 -- who it is for, one line
  surface text,                                  -- where it plays (a URL or a place on the site)
  status text not null default 'planning',       -- planning | rendering | ready
  voice jsonb not null default '{"provider":"higgsfield_seed_audio","element":"7985695a-f508-49d6-b6e6-508d425b609b","name":"Sean A. Russell","speech_rate":-5}'::jsonb,
  final_path text,                               -- the finished video, "<bucket>/<path>"
  poster_path text,
  render_request_at timestamptz,
  feedback jsonb not null default '[]'::jsonb,   -- [{at, text, done}]
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bcps_depot_tiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.bcps_depot_projects(id) on delete cascade,
  position integer not null default 0,
  title text not null default '',
  script text not null default '',
  stills jsonb not null default '[]'::jsonb,     -- [{path, at}]; at = seconds into the line where the still comes in
  audio_path text,
  audio_seconds numeric,
  checked boolean,                               -- null unknown, true the line matches the script word for word
  status text not null default 'script',         -- script | voiced | approved
  voice_request_at timestamptz,
  version integer not null default 0,
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists bcps_depot_tiles_project on public.bcps_depot_tiles(project_id, position);

alter table public.bcps_depot_projects enable row level security;
alter table public.bcps_depot_tiles enable row level security;
