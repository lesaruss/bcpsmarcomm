-- Google Account Access guide (Sean, 2026-11-05): click-through steps for
-- getting into the shared BCPS Google account's tools with your own Broward
-- sign-in, so two-step verification stays on. Its content is written straight
-- into bcps_guides.def and is not in this file or anywhere in the repository,
-- which is public.
--
-- Readers: none named yet. Sean runs the steps himself first (admins and
-- SuperAdmins pass requireDocumentAccess). Opening it to Samira Hemraj and
-- others is a grant on this row, added when Sean says so. Apply once the code
-- that opens the guide is live.

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, visibility, section, doc_url, project, doc_date, doc_date_sort)
select 'bcps', 'document', 'google-account-access', 'Google Account Access',
  'How to get into the shared BCPS Google account''s tools with your own Broward sign-in, step by step, with two-step verification kept on.',
  'Guide', 'restricted', 'documents', '/playbooks/google-account-access', 'MarComm', 'November 5, 2026', '2026-11-05'
where not exists (select 1 from public.acl_objects where brand = 'bcps' and kind = 'document' and slug = 'google-account-access');
