-- 2026-11-03 (V): the BCPS Google Account Security playbook had recipients but
-- no catalog row, so it appeared in no playbook list. Adds it under the
-- MarComm project, restricted, with view for Sean and Samira only (admins pass).
-- Already applied in production; safe to run twice.
insert into public.acl_objects (brand, kind, slug, title, description, doc_type, doc_date, icon, section, project, visibility, sensitive, doc_url)
select 'bcps', 'document', 'bcps-google-account-security', 'BCPS Google Account Security',
  'How the BCPS MarComm Google account is shared: individual sign-ins, shared Drive folders and YouTube managers, with where it stands and the next steps.',
  'Playbook', 'October 29, 2026', '📘', 'documents', 'MarComm', 'restricted', false, '/playbooks/bcps-google-account-security'
where not exists (select 1 from public.acl_objects where brand='bcps' and kind='document' and slug='bcps-google-account-security');

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view' from public.acl_objects o, auth.users u
where o.brand='bcps' and o.kind='document' and o.slug='bcps-google-account-security'
  and u.email in ('samira.hemraj@browardschools.com', 'sean.russell@browardschools.com')
  and not exists (select 1 from public.acl_grants g where g.object_id=o.id and g.subject_type='user' and g.subject_id::text=u.id::text);
