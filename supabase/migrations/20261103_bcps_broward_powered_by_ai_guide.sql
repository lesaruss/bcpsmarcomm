-- Broward Powered by AI guide (Sean, 2026-11-03): one restricted guide in place
-- of the "Broward Powered by AI" site entry and the "BCPS Powered by AI:
-- Progress Tracker" entry in Documents. Its content is written straight into
-- bcps_guides.def and is not in this file or anywhere in the repository, which
-- is public (see 20261030_bcps_website_platform_guide.sql for the table).
--
-- Readers (Sean, 2026-11-03, the default he accepted): the four groups that
-- already held both replaced entries, nothing more. No reader list from any
-- other document is added. The July 21 and August 7 meeting briefs keep their
-- own reader lists and are Reference links only.
-- Apply once the code that opens the guide is live.

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'broward-powered-by-ai', 'Broward Powered by AI',
  'The browardschools.ai site, what has happened, the recognition it has earned and what is still open, in one place.',
  'Guide', 'restricted', 'documents', '/playbooks/broward-powered-by-ai', 'Departments', 'November 3, 2026', '2026-11-03'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'broward-powered-by-ai');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o, public.acl_groups g
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'broward-powered-by-ai'
  and g.name in ('District Web Team', 'Leadership View', 'Office of Communications', 'Web Content Management')
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);
