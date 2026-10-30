-- BCPS Powered by AI guide (Sean, 2026-10-30): one restricted guide, filed
-- under Departments, in place of the Progress Tracker and the Broward Powered
-- by AI site listing. A case study of browardschools.ai for senior leadership:
-- how it came together, the progress tracker, recognition and the GA4
-- analytics. Apply once the code that opens it is live.
--
-- The content is in bcps_guides.def (slug 'bcps-powered-by-ai'), written
-- straight to the database like the Website & Platform guide, never in this
-- repository. Sources: the bcpsai repository history, the progress tracker on
-- browardschools.ai, bcps_campaign_analytics and bcps_campaign_daily (GA4,
-- synced 2026-10-29) and the Aug 7 launch brief.

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'bcps-powered-by-ai', 'BCPS Powered by AI',
  'How browardschools.ai came together: the story and timeline, the progress tracker, recognition and the analytics, in one guide for District leadership.',
  'Guide', 'restricted', 'documents', '/playbooks/bcps-powered-by-ai', 'Departments', 'October 30, 2026', '2026-10-30'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'bcps-powered-by-ai');

-- The same readers as the two documents it replaces: Office of
-- Communications, Web Content Management, District Web Team and Leadership
-- View, all view.
insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, g.subject_type, g.subject_id, g.role
from public.acl_objects o
join public.acl_objects src on src.brand = 'bcps' and src.kind = 'document' and src.slug = 'bcps-ai-progress-tracker'
join public.acl_grants g on g.object_id = src.id
where o.brand = 'bcps' and o.kind = 'document' and o.slug = 'bcps-powered-by-ai'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = g.subject_type and x.subject_id = g.subject_id);
