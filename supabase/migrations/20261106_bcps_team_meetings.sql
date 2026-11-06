-- Web Team Meetings (Sean, 2026-11-06): a page inside the District Web Team
-- Guide for the Web Team Meeting (Sean, Farrah Wilson, Felicia Hicks). Each
-- meeting starts as an agenda with links; after the meeting the transcript is
-- uploaded on the page and Claude turns it into the notes (recap, decisions,
-- action items, what happened to each agenda item). The recording is embedded.
-- Not a playbook. Rows are read and written only by /api/bcps/team-meetings
-- (service role), for people with a named grant on the 'web-team-meetings' page.

create table if not exists public.bcps_team_meetings (
  id uuid primary key default gen_random_uuid(),
  team text not null default 'web-team',
  meeting_date date not null,
  title text not null,
  time_label text,
  join_url text,
  attendees text[] not null default '{}',
  agenda jsonb not null default '[]'::jsonb,
  video_url text,
  transcript text,
  notes jsonb,
  notes_at timestamptz,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bcps_team_meetings_team_date on public.bcps_team_meetings (team, meeting_date desc);
alter table public.bcps_team_meetings enable row level security;

insert into public.acl_objects (brand, kind, slug, title, visibility, description)
select 'bcps', 'page', 'web-team-meetings', 'Web Team Meetings', 'restricted',
       'Agendas, notes and recordings of the Web Team Meeting (Sean, Farrah, Felicia).'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'page' and slug = 'web-team-meetings');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'edit'
from public.acl_objects o
join auth.users u on lower(u.email) in ('farrah.wilson@browardschools.com', 'felicia.hicks@browardschools.com', 'sean.russell@browardschools.com')
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'web-team-meetings'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'user' and x.subject_id = u.id);
