-- Documents list cleanup, first pass (Sean, 2026-10-30). Entries moved to the
-- 'archive' section leave every list (Documents, Meeting Notes and Records
-- each show one section) while their addresses keep working. To bring one
-- back, set its section to 'documents'.
--   New Member Dashboard, Preview: an August mock-up of the dashboard, retired.
--   School Assignments 2026-27: lives inside the School Website Service Model
--   playbook, so it is not listed on its own.
update public.acl_objects
set section = 'archive'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-wcm-dashboard-preview-2026-08-27', 'bcps-school-assignments-2026-27');
