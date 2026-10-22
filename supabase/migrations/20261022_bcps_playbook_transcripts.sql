-- Meeting transcripts on Playbooks, Playbook buttons on Web Team Assignments
-- (Sean, 2026-10-22, with Vanessa on the call).
--
-- 1. Uploads can belong to a Playbook (tracker 'playbook').
-- 2. Web Team Assignments transcripts: Vanessa and Felicia only, instead of
--    the whole District Web Team, so two people are not uploading the same
--    meeting. A superadmin keeps it by role.
-- 3. Every assignment with a Playbook links it (the Playbook button).
-- 4. BCPS Central V2 gets its Playbook, built from the BCPS MarComm document
--    template, with Vanessa and Felicia as its transcript leads.
-- 5. The templates carry the rule, so every new Playbook names its leads.

alter table public.bcps_meeting_uploads add column if not exists playbook_slug text;
create index if not exists bcps_meeting_uploads_playbook_idx on public.bcps_meeting_uploads (playbook_slug, created_at desc) where playbook_slug is not null;

-- 2.
delete from public.acl_grants x
using public.acl_objects o, public.acl_groups g
where x.object_id = o.id and o.brand = 'bcps' and o.kind = 'page' and o.slug = 'meeting-transcripts'
  and x.subject_type = 'group' and x.subject_id = g.id and g.brand = 'bcps' and g.slug = 'dwt';

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'user', u.id, 'view'
from public.acl_objects o
join auth.users u on lower(u.email) in ('vanessa.deslandes@browardschools.com', 'felicia.hicks@browardschools.com')
where o.brand = 'bcps' and o.kind = 'page' and o.slug = 'meeting-transcripts'
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'user' and x.subject_id = u.id);

update public.acl_objects set description = 'Upload a meeting transcript to update Web Team Assignments. Vanessa and Felicia (Sean, 2026-10-22).'
where brand = 'bcps' and kind = 'page' and slug = 'meeting-transcripts';

-- 4. The Playbook. Content is what the tracker and its notes already say.
insert into public.briefings (tenant_id, slug, brand_slug, type, title, author, content, metadata)
select pp.tenant_id, 'bcps-central-v2', 'bcps', 'playbook', 'BCPS Central V2', 'Sean A. Russell',
  replace(t.parameters->>'html_head', substring(t.parameters->>'html_head' from '<title>[^<]*</title>'), '<title>BCPS Central V2</title>') || $html$<body>
<header class="bcps-header" role="banner"><a class="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS MarComm dashboard"><img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" class="bcps-logo"></a><div class="bcps-header-divider" aria-hidden="true"></div><span class="bcps-header-title">BCPS MarComm &middot; BCPS Central V2</span></header>
<main>
  <h1>BCPS Central V2</h1>
  <div class="meta-row">
    <div class="meta-item"><span class="meta-label">Type</span><span class="meta-value"><span class="doc-type-badge">Playbook</span></span></div>
    <div class="meta-item"><span class="meta-label">Brand</span><span class="meta-value">BCPS</span></div>
    <div class="meta-item"><span class="meta-label">Lead</span><span class="meta-value">Vanessa</span></div>
    <div class="meta-item"><span class="meta-label">Support</span><span class="meta-value">Tricia, Rudy</span></div>
    <div class="meta-item"><span class="meta-label">Status</span><span class="meta-value">Ongoing</span></div>
    <div class="meta-item"><span class="meta-label">Prepared by</span><span class="meta-value">Sean A. Russell, District Webmaster, Office of Communications</span></div>
  </div>
  <div class="audience-banner"><p><strong>For:</strong> The District Web Team. Vanessa and Felicia upload meeting transcripts here; the notes are filed under this Playbook.</p></div>
  <h2 class="lead-heading">Overview</h2>
  <div class="section-block lead-summary">
    <p>BCPS Central is the internal portal Web Content Managers use to manage their site content. V1 was declared complete on July 22. V2 is the dashboards: the data BCPS Central collects, shown back to the people who need it, with weekly improvements to BCPS Central itself along the way. Yaco is the developer.</p>
  </div>
  <details class="doc-accordion"><summary><h2>Where It Stands</h2></summary><div class="section-block">
    <div class="agenda-item"><div class="agenda-head"><span class="agenda-title">The data is in</span></div><div class="agenda-detail">Vanessa and Rudy added all the WCM details, the audit launched on time, and the team gets the audit notifications (Oct 14). With this data coming in, Yaco should have enough to build the dashboard.</div></div>
    <div class="agenda-item"><div class="agenda-head"><span class="agenda-title">Ongoing, no fixed deadline</span></div><div class="agenda-detail">Marked ongoing at the Oct 21 District Web Team Meeting.</div></div>
    <div class="agenda-item"><div class="agenda-head"><span class="agenda-title">Still to come</span></div><div class="agenda-detail">The two remaining dashboards, the area superintendent dashboards, and pass/fail grading of the assignments.</div></div>
  </div></details>
  <details class="doc-accordion"><summary><h2>Work Queue</h2></summary><div class="section-block">
    <div class="action-item"><div class="action-num">1</div><div class="action-body"><div class="action-title">Meet Yaco on the area superintendent dashboards</div><div class="action-detail">Vanessa is scheduling it (Oct 21).</div><div class="action-owner">Vanessa</div><div class="action-deadline">Being scheduled</div></div></div>
    <div class="action-item"><div class="action-num">2</div><div class="action-body"><div class="action-title">Build the remaining dashboards and pass/fail grading</div><div class="action-detail">Yaco needs Tricia's confirmation to prioritize it against his other work.</div><div class="action-owner">Yaco, with Tricia</div><div class="action-deadline">No date set</div></div></div>
    <div class="action-item"><div class="action-num">3</div><div class="action-body"><div class="action-title">Check the dashboards for the export button</div><div class="action-detail">The team checks their dashboards, or Logan double-checks it (Oct 21).</div><div class="action-owner">District Web Team</div><div class="action-deadline">No date set</div></div></div>
  </div></details>
  <details class="doc-accordion"><summary><h2>Meeting Notes</h2></summary><div class="section-block">
    <p>Meeting notes for this project are filed under this Playbook from the meeting transcript. Vanessa and Felicia upload them with the Upload meeting transcript button above the Playbook; Claude drafts the summary, decisions, action items and open questions, and the uploader reviews them before they are filed.</p>
  </div></details>
  <details class="doc-accordion"><summary><h2>Links</h2></summary><div class="section-block">
    <div class="link-block"><div class="link-label">Web Team Assignments</div><div class="link-url"><a href="/?page=dashboard&amp;tab=documents&amp;doc=web-team-assignments">BCPS Central V2 row and its notes</a></div></div>
  </div></details>
  <details class="history"><summary>Decision History</summary><div class="body">
    <p><strong>Oct 21:</strong> Marked ongoing with no fixed deadline.</p>
    <p><strong>Sept 23:</strong> V2 is the dashboards. Sept 30 was not realistic for Yaco; the deadline moved to Oct 16.</p>
    <p><strong>Aug 12:</strong> Priority set to medium; not blocking other work.</p>
    <p><strong>Aug 5:</strong> Vanessa became sole lead, with Rudy as support.</p>
    <p><strong>July 22:</strong> V1 declared complete; V2 opened with a confirmed WCM count of about 72.</p>
  </div></details>
</main>
</body>
</html>$html$,
  jsonb_build_object(
    'client', true,
    'template_id', t.id,
    'template_version', t.version,
    'built_from_template', t.id::text,
    'assignment_slug', 'bcps-central-v2',
    'transcript_admins', jsonb_build_array('vanessa.deslandes@browardschools.com', 'felicia.hicks@browardschools.com')
  )
from public.templates t, public.briefings pp
where t.id = 'f7037d82-c5e2-4997-8631-aa68993157a4' and pp.slug = 'portals-project'
  and not exists (select 1 from public.briefings where slug = 'bcps-central-v2');

-- 3. Playbook buttons.
insert into public.bcps_assignment_tags (assignment_slug, playbook_url, updated_at)
select v.slug, 'https://bcpsmarcomm.com/playbooks/' || v.playbook, now()
from (values
  ('bcps-central-v2', 'bcps-central-v2'),
  ('marketing-your-schools-workshop', 'marketing-your-schools-workshop'),
  ('department-hot-labs', 'wcm-hot-labs'),
  ('wcm-dept-roster', 'wcm-roster-approvals'),
  ('widget-iidl-services', 'iidl-services-directory'),
  ('school-wcm-model', 'school-website-service-model'),
  ('portal-pages-refresh', 'portals-project'),
  ('wcm-dept-director-access', 'director-department'),
  ('wcm-dept-marcom-platform', 'wcm-community-hub'),
  ('google-governance', 'bcps-marcomm-launch-plan')
) as v(slug, playbook)
on conflict (assignment_slug) do update set playbook_url = excluded.playbook_url, updated_at = excluded.updated_at
where public.bcps_assignment_tags.playbook_url is null;

-- 5. Templates: every new Playbook names the project leads who upload
-- meeting transcripts.
update public.templates
set parameters = jsonb_set(parameters, '{rules}', (parameters->'rules') || to_jsonb('Meeting transcripts (Sean, 2026-10-22): every Playbook carries metadata.transcript_admins, the emails of the project leads who see Upload meeting transcript above it. Set it when the Playbook is created: the leads Sean names, or else the lead on the matching Web Team Assignments row. Keep it to one or two people so a meeting is uploaded once.'::text)),
    updated_at = now()
where id = 'f7037d82-c5e2-4997-8631-aa68993157a4'
  and not (parameters->'rules') @> to_jsonb(array['Meeting transcripts (Sean, 2026-10-22): every Playbook carries metadata.transcript_admins, the emails of the project leads who see Upload meeting transcript above it. Set it when the Playbook is created: the leads Sean names, or else the lead on the matching Web Team Assignments row. Keep it to one or two people so a meeting is uploaded once.']);

update public.templates
set parameters = jsonb_set(parameters, '{transcript_admins}', to_jsonb('Every BCPS Playbook carries metadata.transcript_admins: the emails of the one or two project leads who see Upload meeting transcript above the Playbook on bcpsmarcomm.com (Sean, 2026-10-22). Set it at creation from the leads Sean names, or else the lead on the matching Web Team Assignments row.'::text)),
    updated_at = now()
where id = 'f4e2d124-c418-4637-b613-2af4ddb289ba';
