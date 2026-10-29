-- Website & Platform guide (Sean, 2026-10-30): one restricted guide in place of
-- the BCPS MarComm Launch Plan, the Platform Ownership Migration playbook and
-- the Google Governance Plan. Its content is served by /api/bcps/guides only to
-- the readers below (requireDocumentAccess), set by Sean on 2026-10-30: the
-- four who held the Launch Plan (Sean A. Russell, Luis A. Morales, Farrah A.
-- Wilson, Manuel Castañeda) and Tricia A. Allen, who oversees the website RFP,
-- plus the Leadership View group that held the migration playbook.
-- Apply once the code that opens it is live.
--
-- The content itself is not in this file or anywhere in the repository, which
-- is public: it is written straight into bcps_guides.def (the GuideDef shape
-- in src/lib/guides/types.ts). Row level security is on with no policies, so
-- only the service role behind /api/bcps/guides can read it.

create table if not exists public.bcps_guides (
  slug text primary key,
  def jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.bcps_guides enable row level security;

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'website-platform', 'Website & Platform',
  'Moving bcpsmarcomm.com and browardschools.ai onto District accounts, the costs and decisions, and where the District website is headed.',
  'Guide', 'restricted', 'documents', '/playbooks/website-platform', 'Platform Ownership', 'October 30, 2026', '2026-10-30'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'website-platform');

-- The reader list: opens the guide (requireDocumentAccess). Manuel Castañeda
-- has no account yet; his row lets him in as soon as he signs up.
insert into public.bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
select 'website-platform', r.name, r.email, 'website-platform-guide'
from (values
  ('Sean A. Russell', 'sean.russell@browardschools.com'),
  ('Luis A. Morales', 'luis.morales@browardschools.com'),
  ('Farrah A. Wilson', 'farrah.wilson@browardschools.com'),
  ('Manuel Castañeda', 'manuel.castaneda@browardschools.com'),
  ('Tricia A. Allen', 'tricia.allen@browardschools.com')
) as r(name, email)
where not exists (select 1 from public.bcps_brief_recipients x where x.brief_slug = 'website-platform' and lower(x.attendee_email) = r.email);

-- Grants: list it in Documents for the readers who have accounts, and for the
-- Leadership View group, which held the migration playbook.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view'
from public.acl_objects o
join auth.users u on lower(u.email) in (select lower(attendee_email) from public.bcps_brief_recipients where brief_slug = 'website-platform')
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'website-platform'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'user' and x.subject_id = u.id);

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'website-platform'
  and g.name = 'Leadership View'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);

-- Iviani Figueroa was added to the Platform Ownership Migration playbook on
-- 2026-10-27 with no recorded approval. Removed at Sean's direction
-- (2026-10-30).
delete from public.bcps_brief_recipients
where brief_slug = 'bcps-platform-ownership-migration' and lower(attendee_email) = 'iviani.figueroa@browardschools.com';
