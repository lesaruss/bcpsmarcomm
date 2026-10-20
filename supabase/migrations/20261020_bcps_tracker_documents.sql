-- The trackers are document cards like the rest of Documents (Sean,
-- 2026-10-20: "have the web team and marcomm assignments tiles designed the
-- same as the others. I'll pin them to the top by marking them as featured").
-- Web Team Assignments already had a document row, pointing at a static copy
-- from July; it now opens the live tracker. MarComm Assignments gets its own
-- row, seen by the same groups as the MarComm Assignments page. On the
-- dashboard each card shows only for people who have that tracker
-- (components/pages/DocumentsPage APP_TRACKERS).
update public.acl_objects
   set doc_url = '/?page=dashboard&tab=documents&doc=web-team-assignments',
       description = 'What the District Web Team is carrying, who leads it and where it stands.',
       doc_date = null, doc_date_sort = null, updated_at = now()
 where brand = 'bcps' and kind = 'document' and slug = 'bcps-web-team-assignments';

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, icon, section, visibility, sensitive, doc_url, featured, owner_id)
select 'bcps', 'document', 'bcps-marcomm-assignments', 'MarComm Assignments', 'Every Marcomm Meeting request, its lead and its status.',
       'Tracker', '🗂️', 'documents', 'restricted', false, '/marcomm-assignments', false, '12404ad5-3e28-457b-9439-992eaaecf01d'
 where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'bcps-marcomm-assignments');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select d.id, g.subject_type, g.subject_id, 'view'
  from public.acl_objects d
  join public.acl_objects p on p.brand = 'bcps' and p.kind = 'page' and p.slug = 'marcomm-assignments'
  join public.acl_grants g on g.object_id = p.id
 where d.brand = 'bcps' and d.kind = 'document' and d.slug = 'bcps-marcomm-assignments'
   and not exists (select 1 from public.acl_grants x where x.object_id = d.id and x.subject_type = g.subject_type and x.subject_id = g.subject_id);
