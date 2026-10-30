-- Documents sorted into four groups (Sean, 2026-10-30): District Web Team,
-- Departments, Schools and MarComm, in place of free-form projects. The group
-- is kept in acl_objects.project, which the Documents page now offers only
-- these four values for. Entries moved to the 'archive' section leave the list
-- (admins still see them under Archived) and their addresses keep working.
update public.acl_objects set project = 'District Web Team'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-website-governance-plan-2026-06-10', 'bcps-web-team-assignments', 'website-platform',
               'bcps-wcm-kickoff-planning-2026-06-25', 'marketing-your-schools-workshop');

update public.acl_objects set project = 'Departments'
where brand = 'bcps' and kind = 'document'
  and slug in ('wcm-department', 'director-department', 'bcps-iidl-website-build-brief',
               'bcps-ai-progress-tracker', 'bcps-powered-by-ai-site');

update public.acl_objects set project = 'Schools'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-central-v2', 'school-website-service-model', 'bcps-wcm-scope-2026');

update public.acl_objects set project = 'MarComm'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-marcomm-assignments', 'bcps-implementation-plan-2026-2027', 'bcps-about-us-assessment-2026-08-28');

update public.acl_objects set title = 'WCM Kickoff Event: Final Report'
where brand = 'bcps' and kind = 'document' and slug = 'bcps-wcm-kickoff-planning-2026-06-25';

update public.acl_objects set title = 'Website and Social Media Implementation Plan'
where brand = 'bcps' and kind = 'document' and slug = 'bcps-implementation-plan-2026-2027';

-- Archived. The Website Management Center Scope Review stays reachable as an
-- archived reference from BCPS Central V2's Files and Links.
update public.acl_objects set section = 'archive'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-web-team-role-routing-2026-07-22', 'bcps-ooc-task-queue-2026-07-22', 'bcps-ooc-web-team-assignments',
               'bcps-find-it-fast-editing-guide', 'bcps-dept-migrations-2026-06-29', 'bcps-wcm-scope-2026');

-- The link in BCPS Central V2 (applied with the HTML base64-encoded, per
-- registry SUPABASE-MCP-HTML-PAYLOAD-TIMEOUT):
--   <div class="link-block"><div class="link-label">Archived reference</div>
--   <div class="link-url"><a href="/briefs/bcps-wcm-scope-2026">Website Management
--   Center Scope Review (Schools)</a></div></div>
-- added after the Web Team Assignments link under Files and Links.

-- Documents a guide replaced (left out of the list) take their guide's group.
update public.acl_objects set project = 'District Web Team'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-marcomm-launch-plan', 'bcps-platform-ownership-migration', 'google-governance-plan');

update public.acl_objects set project = 'Departments'
where brand = 'bcps' and kind = 'document'
  and slug in ('bcps-wcm-registration-2026-27', 'bcps-wcm-cert-complete-2026-27', 'bcps-wcm-start-here');
