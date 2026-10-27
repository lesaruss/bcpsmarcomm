-- Website Governance Plan: legacy brief -> BCPS Playbook (V, 2026-10-27).
-- Moves the brief from mock_pages into briefings as a Playbook so its lead,
-- Vanessa Deslandes, gets the meeting transcript upload bar
-- (metadata.transcript_admins, requirePlaybookTranscriptAccess). Content is
-- copied byte-for-byte (md5 4f167f644d5d1891a5561a3e7caf8efe). The 9-person
-- bcps_brief_recipients list keys off the unchanged slug, so the doc still
-- needs a signed-in, listed reader (or an admin).
-- The old mock_pages row is retired, not deleted: surface 'brief-migrated'
-- makes /briefs/<slug> 301 to /playbooks/<slug>, and the row stays as a backup.
-- Applied 2026-10-27 (insert via execute_sql; the two updates via the
-- one-time function ve-once-governance-playbook, now a 410 stub).

insert into public.briefings (tenant_id, brand_slug, type, slug, title, content, author, status, briefing_date, metadata)
select '00000000-0000-4000-a000-000000000001', 'bcps', 'playbook', m.slug, 'Website Governance Plan', m.content, 'logan', 'published', date '2026-06-10',
  jsonb_build_object('client', true, 'doc_kind', 'plan', 'migrated_from', 'mock_pages',
    'transcript_admins', jsonb_build_array('vanessa.deslandes@browardschools.com'))
from public.mock_pages m
where m.slug = 'bcps-website-governance-plan-2026-06-10'
  and not exists (select 1 from public.briefings b where b.brand_slug = 'bcps' and b.type = 'playbook' and b.slug = m.slug);

update public.acl_objects
set doc_url = '/playbooks/bcps-website-governance-plan-2026-06-10'
where id = '47a4ffb2-54f3-412e-9f26-b90782689e78'
  and doc_url = '/briefs/bcps-website-governance-plan-2026-06-10';

update public.mock_pages
set surface = 'brief-migrated', updated_at = now()
where id = '15adba42-a9ba-4862-9eb0-b43d73bf9177'
  and surface = 'brief'
  and exists (select 1 from public.briefings
              where slug = 'bcps-website-governance-plan-2026-06-10' and type = 'playbook'
                and md5(content) = '4f167f644d5d1891a5561a3e7caf8efe');
