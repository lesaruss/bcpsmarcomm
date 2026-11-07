-- Certification handoff, Saturday Nov 7, 2026 (Sean: "log it so I can pick it
-- up Monday from Web Team Assignments"). Updates the three certification
-- assignment rows, adds two new rows, logs a note on each, and puts a
-- "Pick up here" section at the top of the certification record.

begin;

-- 1. Department WCM Certification (umbrella row)
update public.bcps_assignment_tags set
  description_override = $d$Department WCM certification. Deadline was Thursday, Nov 5. Sean, Nov 5: anyone not finished by the end of Sunday, Nov 8 has their access to make updates to their department's website paused until they finish. NOTE: as of Sat Nov 7 no WCM has been told this (the Friday emails did not send). Pick up in the record: "Pick up here, Monday Nov 9".$d$,
  lead_override = 'Sean A. Russell',
  deadline_date = '2026-11-09',
  playbook_url = 'https://bcpsmarcomm.com/playbooks/bcps-wcm-cert-followup-2026-11-03',
  updated_at = now()
where assignment_slug = 'canvas-course-departments';

-- 2. Certification page: built and live
update public.bcps_assignment_tags set
  description_override = $d$Live at bcpsmarcomm.com/certification-hub (SuperAdmin). Overview: Where everyone is (Completed / Pending, sortable, Pending highest % first) beside the leaderboard. Outreach: Campaigns (with the reminder preview), What recipients see, then the Roster with a tab per group, search and Clear all. PRs 242, 243, 247, 251. Email templates and the access-pause flow continue under "Certification access pause, reminder and reinstatement".$d$,
  lead_override = 'Logan',
  status = 'completed',
  completed_at = now(),
  updated_at = now()
where assignment_slug = 'certification-page';

-- 3. Friday message to all WCMs: not sent
update public.bcps_assignment_tags set
  title_override = 'Certification wrap-up email to all WCMs (NOT SENT, reschedule)',
  description_override = $d$Was planned for Fri Nov 6. Did not send (no sends on record after Nov 3). Approved changes from Nov 5 not yet built: send at 1 PM after the 8 AM reminder; fix the access line ("access to make updates to their department's website", not "BCPS MarComm"); invite to the Nov 10 Hot Lab "Introduction to the audit process" with a button to the Hot Labs page. Text in the record. Needs a new send time from Sean.$d$,
  lead_override = 'Logan',
  deadline_date = '2026-11-09',
  updated_at = now()
where assignment_slug = 'cert-congrats-message';

-- 4. New: the access pause flow
insert into public.bcps_assignment_tags
  (assignment_slug, title_override, description_override, lead_override, status, team_ooc, team_app_services,
   start_date, deadline_date, playbook_url, added_from_meeting, added_at, updated_at)
values
  ('cert-access-pause-flow',
   'Certification access pause, reminder and reinstatement',
   $d$Sean's plan (Nov 5): (1) reminder to everyone not finished, 8 AM: finish by the end of Sunday or access to make updates is paused; (2) Monday 9 AM: access-paused email to the WCM with their director copied; (3) when someone finishes, Sean gets a "Reinstate access" alert; (4) Sean restores access and clicks Mark confirmed in Outreach, which emails the WCM and director congratulations. All four texts drafted and in the record. Nothing built yet. First call Monday: the Sunday deadline was never sent, so pick a new deadline (recommended: end of Wed Nov 11) or pause now.$d$,
   'Logan', 'in-progress', false, false,
   '2026-11-05', '2026-11-09',
   'https://bcpsmarcomm.com/playbooks/bcps-wcm-cert-followup-2026-11-03',
   '2026-11-07 Certification handoff', now(), now())
on conflict (assignment_slug) do nothing;

-- 5. New: Hot Labs page and the Nov 10 audit intro
insert into public.bcps_assignment_tags
  (assignment_slug, title_override, description_override, lead_override, status, team_ooc, team_app_services,
   start_date, deadline_date, playbook_url, added_from_meeting, added_at, updated_at)
values
  ('hot-labs-page-audit-intro',
   'Hot Labs page and Nov 10 Hot Lab: Introduction to the audit process',
   $d$Sean, Nov 5: Tuesday Nov 10 Hot Lab walks WCMs through the audit start to finish, with part of it recorded to share in a later email. Build bcpsmarcomm.com/hot-labs: the next session and its topic with a Join on Teams button, then every past Hot Lab with notes and recording. The wrap-up email links to it. Not built yet.$d$,
   'Logan', 'in-progress', false, false,
   '2026-11-05', '2026-11-10',
   'https://bcpsmarcomm.com/playbooks/wcm-hot-labs',
   '2026-11-07 Certification handoff', now(), now())
on conflict (assignment_slug) do nothing;

insert into public.bcps_assignment_notes (assignment_slug, note_text, author) values
  ('canvas-course-departments', 'Nov 7 handoff: the Friday wrap-up and reminder did not send, so the Sunday Nov 8 deadline has not reached any WCM. Decide Monday before any access comes off. See the record, "Pick up here".', 'Logan'),
  ('certification-page', 'Nov 7: marked complete. Live at /certification-hub with Overview and Outreach (PRs 242, 243, 247, 251).', 'Logan'),
  ('cert-congrats-message', 'Nov 7: not sent. Nothing scheduled it; it waits for a Send on the Outreach page under campaign cert-update-2026-11-06. Approved edits (1 PM, access line, Hot Lab button) are not built yet.', 'Logan'),
  ('cert-access-pause-flow', 'Nov 7: added from the Nov 5 chat with Sean. Drafts of all four emails are in the record.', 'Logan'),
  ('hot-labs-page-audit-intro', 'Nov 7: added from the Nov 5 chat with Sean.', 'Logan');

-- 6. The certification record: "Pick up here" at the top, version 1.1
update public.briefings set
  content = replace(replace(content,
    '<span><strong>Version:</strong> 1.0</span>',
    '<span><strong>Version:</strong> 1.1</span>
    <span><strong>Updated:</strong> Saturday, November 7, 2026</span>'),
    '<h2>Overview</h2>',
$h$<h2>Pick up here, Monday November 9</h2>
  <div class="callout" style="background:rgba(197,83,38,0.08);border-color:rgba(197,83,38,0.35)">
    <p><strong style="color:var(--bcps-orange)">Read first:</strong> the Friday emails did not send. The last certification sends on record are November 2 (congratulations, 52 people) and November 2 to 3 (follow-up, 15 people). No WCM has been told about the Sunday, November 8 deadline or the access pause.</p>
  </div>
  <div class="card">
    <div class="action"><div class="action-num">1</div><div><div class="action-title">Decide the deadline before any access comes off</div>
    <div class="action-detail">Because nobody was warned, either give a new deadline or pause now. Recommended: a new deadline of the end of Wednesday, November 11, the reminder (below) on Monday at 8 AM with that date, and the pause on Thursday morning. <span class="owner">Owner: Sean.</span></div></div></div>
    <div class="action"><div class="action-num">2</div><div><div class="action-title">Send the reminder, then the wrap-up</div>
    <div class="action-detail">Reminder first (8 AM, everyone not finished), wrap-up later the same day (1 PM, every WCM). Both texts are below. The reminder still has to be built into Outreach; the wrap-up exists but needs the three approved edits. <span class="owner">Owner: Logan builds, Sean approves the send.</span></div></div></div>
    <div class="action"><div class="action-num">3</div><div><div class="action-title">Build the pause and reinstatement steps</div>
    <div class="action-detail">The access-paused email (WCM with director copied), Sean&rsquo;s Reinstate access alert when someone finishes, and Mark confirmed in Outreach, which sends the congratulations email to the WCM and director. Nothing here is built yet. <span class="owner">Owner: Logan.</span></div></div></div>
    <div class="action"><div class="action-num">4</div><div><div class="action-title">Hot Labs page and the November 10 Hot Lab</div>
    <div class="action-detail">Tuesday&rsquo;s Hot Lab is an introduction to the audit process, partly recorded to share later. Build bcpsmarcomm.com/hot-labs: the next session and its topic with Join on Teams, then every past Hot Lab with notes and recording. The wrap-up links to it. <span class="owner">Owner: Logan.</span></div></div></div>
  </div>

  <h2>What Sean decided, November 5</h2>
  <div class="card">
    <p><strong>Deadline:</strong> the end of Sunday, November 8 (to be reset, see step 1). Anyone not finished has their <strong>access to make updates to their department&rsquo;s website</strong> paused until they finish. Sean removes access by hand; the emails do not say when.</p>
    <p><strong>Order:</strong> reminder at 8 AM so people have the whole day; the wrap-up at 1 PM, since it is a touch base. On the pause morning, 9 AM: the access-paused email to the WCM with their director copied. When someone finishes: an alert to Sean, Sean restores access and clicks Mark confirmed, which emails the WCM and director.</p>
    <p><strong>Tone:</strong> never hostile. A note that access is paused, how to get it back, and the ways we help.</p>
    <p><strong>Built and live:</strong> the Certification page at bcpsmarcomm.com/certification-hub (Overview and Outreach, Roster with Clear all). PRs 242, 243, 247, 251.</p>
  </div>

  <h2>Approved drafts</h2>
  <div class="card">
    <p><strong>1. Reminder (8 AM, everyone not finished).</strong> Subject: Your WCM certification: finish by Sunday night</p>
    <p>Hi [First name], You&rsquo;re at [their %] on the Department WCM Certification, and I want to make sure you get across the line. Please complete it by <strong>the end of Sunday, November 8</strong>. If it isn&rsquo;t finished by then, your access to make updates to your department&rsquo;s website will be paused until it&rsquo;s complete. You and your director will get a short note with the next steps and the ways we can support you. Pick up right where you left off: [Finish my certification]. If something is getting in the way, just reply to this email and tell me. I&rsquo;m happy to help. Sean</p>
  </div>
  <div class="card">
    <p><strong>2. Wrap-up (1 PM, every WCM).</strong> Subject: Department WCM Certification: thank you, and what&rsquo;s next. The text already in the site, with three edits:</p>
    <p>(a) Replace &ldquo;A few WCMs haven&rsquo;t finished yet. I&rsquo;ll reach out to each of you individually to see what would help. Starting Monday, November 9, access to BCPS MarComm is paused for anyone who hasn&rsquo;t completed the certification, until it&rsquo;s done.&rdquo; with &ldquo;If you haven&rsquo;t finished yet, you received a note from me this morning. Anyone who hasn&rsquo;t completed the certification by the end of Sunday, November 8 will have their access to make updates to their department&rsquo;s website paused until it&rsquo;s done.&rdquo;</p>
    <p>(b) Replace the Hot Lab line with: &ldquo;Tuesday&rsquo;s Hot Lab: an introduction to the audit process. On Tuesday, November 10, 11:30 AM to 12:30 PM, I&rsquo;ll walk you through the audit from start to finish: where it is, how to read each item, and how to fix it and check it off. Part of the session will be recorded, so anyone who can&rsquo;t make it can watch it afterward.&rdquo;</p>
    <p>(c) Add a button, &ldquo;See Hot Labs and join,&rdquo; to bcpsmarcomm.com/hot-labs. If the deadline moves (step 1), both emails take the new date.</p>
  </div>
  <div class="card">
    <p><strong>3. Access paused (9 AM on the pause day, WCM with director copied).</strong> Subject: Website update access paused until your WCM certification is complete</p>
    <p>Hi [First name], Your access to make updates to the [Department] website is paused because the Department WCM Certification isn&rsquo;t complete yet. You&rsquo;re at [x]%. This isn&rsquo;t a mark against you. It&rsquo;s how we make sure everyone who edits a District website has the same foundation. To get your access back: finish the certification. As soon as it&rsquo;s marked complete, I&rsquo;ll reinstate your access, and you and your director will get a confirmation. [Finish my certification]. Ways we can help: reply to this email with any question, or join Hot Lab on Tuesday, November 10, 11:30 AM to 12:30 PM, and we&rsquo;ll work through it together. [Director name], I&rsquo;ve copied you so you know where things stand. Nothing is needed from you beyond encouraging [First name] to finish. Sean</p>
  </div>
  <div class="card">
    <p><strong>4. To Sean only, when someone finishes.</strong> Subject: Reinstate access: [Name] finished the certification. Body: [Name] ([Department]) completed the certification at [time]; their website update access is paused. Restore their access, then click Mark confirmed on their row in Outreach, which sends the confirmation to them and their director. [Open their row]</p>
  </div>
  <div class="card">
    <p><strong>5. Access back (sent by Mark confirmed, WCM with director copied).</strong> Subject: Congratulations: your certification is complete and your access is back</p>
    <p>Hi [First name], Congratulations on completing the Department WCM Certification. Your access to make updates to the [Department] website has been reinstated, and your certificate and badge are on the course page. Next up is your department&rsquo;s website audit. The Department WCM Guide walks you through it one step at a time. [Open the Department WCM Guide]. [Director name], [First name] is fully certified and back to updating your website. Thank you for your support. Sean</p>
  </div>
  <p style="font-size:13px">Tracked on Web Team Assignments: Department WCM Certification; Certification wrap-up email to all WCMs (NOT SENT, reschedule); Certification access pause, reminder and reinstatement; Hot Labs page and Nov 10 Hot Lab: Introduction to the audit process.</p>

  <h2>Overview</h2>$h$),
  updated_at = now()
where brand_slug = 'bcps' and slug = 'bcps-wcm-cert-followup-2026-11-03'
  and content not like '%Pick up here, Monday November 9%';

-- 7. Two rows added Nov 5 never showed on the tracker: rows that live only in
-- the database need added_from_meeting set (web-team-tracker.ts filters on it).
update public.bcps_assignment_tags set added_from_meeting = '2026-11-05 Hot Lab, added by Logan', updated_at = now()
where assignment_slug in ('cert-congrats-message','certification-page') and added_from_meeting is null;
insert into public.bcps_assignment_notes (assignment_slug, note_text, author) values
 ('cert-congrats-message','Nov 7: this row was missing from the tracker since Nov 5 (added_from_meeting was empty); now shown.','Logan'),
 ('certification-page','Nov 7: this row was missing from the tracker since Nov 5 (added_from_meeting was empty); now shown.','Logan');

commit;
