-- Tag register for browardschools.com (Sean, 2026-11-05).
--
-- The District runs one Tag Manager container it owns, GTM-NTGC6X38. Any
-- department that wants an outside agency to track in it goes through the
-- District Web Team: the agency's access is opened and closed on set dates,
-- the agency builds in its own workspace with Edit access, and the District
-- publishes after the bcps-gtm-setup review step passes. This register is the
-- record of who has access and of every tag on the site, including the ones
-- the District does not own (Finalsite's container and its Google tag).
--
-- Read and written only through /api/bcps/tag-register (superadmin), so RLS
-- is on with no policies. Safe to run twice.

create table if not exists public.bcps_gtm_access (
  id uuid primary key default gen_random_uuid(),
  department_slug text,
  agency text not null,
  purpose text,
  contact_name text,
  contact_email text,
  people jsonb not null default '[]'::jsonb,
  gtm_permission text not null default 'edit' check (gtm_permission in ('read', 'edit', 'approve', 'publish', 'admin')),
  workspace text,
  contract_ref text,
  contract_owner text,
  director_approval text,
  opens_on date,
  closes_on date,
  status text not null default 'requested' check (status in ('requested', 'open', 'closed', 'denied')),
  intake jsonb not null default '{}'::jsonb,
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bcps_gtm_tags (
  id uuid primary key default gen_random_uuid(),
  container text not null,
  name text not null,
  platform text,
  tag_type text,
  ids text,
  owner text,
  department_slug text,
  access_id uuid references public.bcps_gtm_access(id) on delete set null,
  purpose text,
  pages text,
  data_collected text,
  personal_data boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'live', 'paused', 'removed', 'not_ours')),
  live_since date,
  review_on date,
  notes text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bcps_gtm_access enable row level security;
alter table public.bcps_gtm_tags enable row level security;

create index if not exists bcps_gtm_tags_access_idx on public.bcps_gtm_tags (access_id);

-- Who already has access to GTM-NTGC6X38, and the Magnet request.
insert into public.bcps_gtm_access (agency, purpose, contact_email, gtm_permission, workspace, opens_on, status, notes, updated_by)
select 'District Web Team (container owner)', 'Owns GTM-NTGC6X38, the District container on browardschools.com.', 'bcps.pio@gmail.com', 'admin', 'Default Workspace', '2026-10-29', 'open',
  'Permanent. Created the container and published version 5 on 2026-10-29.', 'logan'
where not exists (select 1 from public.bcps_gtm_access where agency = 'District Web Team (container owner)');

insert into public.bcps_gtm_access (agency, purpose, gtm_permission, workspace, opens_on, status, notes, updated_by)
select 'BCPS analytics service account (bcps-gtm-setup)', 'Builds and publishes the District''s own tags, and runs the read-only review of agency workspaces, without anyone sharing a login.', 'publish', 'Default Workspace', '2026-10-29', 'open',
  'Permanent. Supabase edge function bcps-gtm-setup; review action added in v9 (2026-11-05).', 'logan'
where not exists (select 1 from public.bcps_gtm_access where agency = 'BCPS analytics service account (bcps-gtm-setup)');

insert into public.bcps_gtm_access (department_slug, agency, purpose, contact_name, contact_email, gtm_permission, workspace, director_approval, status, notes, updated_by)
select 'magnet-innovative-programs', 'Brkthru (to confirm)', 'School Choice 2026 advertising for Magnet programs: the agency tracks ad conversions and reports metrics to Magnet.',
  'Shannon (to confirm)', 'shannon@brkthru.com', 'edit', 'Magnet - Brkthru', 'Pending: Dr. Kassandra Fried', 'requested',
  'Requested 2026-11-05 by Magnet & Innovative Programs, following up Allan Llanos''s email. Agency and contact read from the Tag Assistant screenshot Magnet sent (signed in as shannon@brkthru.com); confirm both in the intake answers. Edit access only; the District publishes after review.', 'logan'
where not exists (select 1 from public.bcps_gtm_access where department_slug = 'magnet-innovative-programs' and agency = 'Brkthru (to confirm)');

-- Every tag on browardschools.com as of 2026-11-05 (live container version 5,
-- Tag Assistant on the Magnet How to Apply page).
insert into public.bcps_gtm_tags (container, name, platform, tag_type, ids, owner, access_id, purpose, pages, data_collected, status, live_since, review_on, updated_by)
select 'GTM-NTGC6X38', v.name, v.platform, v.tag_type, v.ids, 'District Web Team',
  (select id from public.bcps_gtm_access where agency = 'District Web Team (container owner)'),
  v.purpose, v.pages, v.data, 'live', '2026-10-29', '2027-01-29', 'logan'
from (values
  ('Google tag - District property (no page view)', 'GA4', 'Google tag', 'G-EW5DDY3E0Z',
   'Sets up the District GA4 property so the events below reach it. Sends no page view, because Finalsite''s tag already does.',
   'All pages on www.browardschools.com', 'None on its own (configuration only).'),
  ('GA4 - Finalsite document download', 'GA4', 'GA4 event', 'G-EW5DDY3E0Z',
   'Counts clicks on Finalsite document-library links as file_download, which GA4 cannot see on its own.',
   'www.browardschools.com, clicks on /fs/resource-manager/view/ links', 'Link URL and link text.'),
  ('Finalsite video listener', 'GA4', 'Custom HTML', null,
   'Listens to the Finalsite video player and passes plays, progress and completions to the data layer.',
   'All pages on www.browardschools.com', 'Video title, page URL, percent watched.'),
  ('GA4 - Finalsite video', 'GA4', 'GA4 event', 'G-EW5DDY3E0Z',
   'Sends video_start, video_progress and video_complete for the Finalsite player.',
   'www.browardschools.com, when a Finalsite video plays', 'Video title, page URL, percent watched.')
) as v(name, platform, tag_type, ids, purpose, pages, data)
where not exists (select 1 from public.bcps_gtm_tags t where t.container = 'GTM-NTGC6X38' and t.name = v.name);

insert into public.bcps_gtm_tags (container, name, platform, tag_type, ids, owner, purpose, pages, status, notes, updated_by)
select v.container, v.name, v.platform, v.tag_type, v.ids, 'Finalsite', v.purpose, 'Every page on browardschools.com', 'not_ours', v.notes, 'logan'
from (values
  ('GTM-P3BGC7', 'Finalsite Tag Manager container', 'Tag Manager', 'Container', 'GTM-P3BGC7',
   'Finalsite''s own container, loaded by the Finalsite site template.',
   'Shared across Finalsite''s clients (finalsite.com loads it too), so the District cannot own it or grant access to it.'),
  ('GTM-P3BGC7', 'Finalsite Google tag', 'GA4', 'Google tag', 'G-B601R4LMEG',
   'Sends page views, and forwards them to the District property G-EW5DDY3E0Z as a linked destination.',
   'Keeps Finalsite''s custom events in G-B601R4LMEG, a property bcps.pio cannot see. Owner of that property to be confirmed with Finalsite.')
) as v(container, name, platform, tag_type, ids, purpose, notes)
where not exists (select 1 from public.bcps_gtm_tags t where t.container = v.container and t.name = v.name);

insert into public.stream_events (owner, station, summary, keywords, status, context_link)
select 'logan','bcps','Tag Register built (superadmin page, District Web Team menu): bcps_gtm_access records each agency''s access to GTM-NTGC6X38 with open and close dates, director approval and the 11 intake answers; bcps_gtm_tags records every tag on browardschools.com, including Finalsite''s GTM-P3BGC7 and G-B601R4LMEG as not ours. Seeded with the District owner, the bcps-gtm-setup service account, the Magnet/Brkthru request and the 6 known tags.',
 array['bcps','gtm','governance','tag-register','magnet','vendor-access'],'completed','https://github.com/lesaruss/bcpsmarcomm/tree/claude/epic-lovelace-bcvdcm'
where not exists (select 1 from public.stream_events where summary like 'Tag Register built (superadmin page%');
