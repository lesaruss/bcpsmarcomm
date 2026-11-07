-- Google Tag Manager governance: Monday pick-up records (Sean, 2026-11-07).
-- Applied the same day through execute_sql. Safe to run twice.
--
-- The playbook itself (briefings slug bcps-tag-manager-governance, type
-- playbook, gated to Sean A. Russell) is gated District content and lives only
-- in the database, built from the bcps-doc-project-playbook template via the
-- bcps-google-account-security playbook. These are the rows that point to it.

-- Web Team Assignment
insert into public.bcps_assignment_tags (assignment_slug, status, priority, team_ooc, team_app_services, title_override, description_override, lead_override, support_override, is_ongoing, playbook_url, added_from_meeting, added_at, updated_at)
select 'tag-manager-governance', 'in-progress', 'high', true, false, 'Google Tag Manager Governance',
 'One District-owned Tag Manager container (GTM-NTGC6X38). Agencies get Edit in their own workspace, the District reviews and publishes, access opens and closes on set dates. Built and live: Tag Register, workspace review, narrated Tag Manager Guide (Sean''s voice). Where it stands Nov 7: reply to Magnet & Innovative Programs drafted with the 11 intake questions; Brkthru (to confirm) is in the Tag Register as Waiting for intake. NEXT (Mon Nov 9): confirm the reply went to Magnet, or send it from the playbook. Then record their answers, invite the agency (Edit), open access. Pick up in chat: "pick up Tag Manager governance".',
 'Sean A. Russell', array['Logan'], false, 'https://bcpsmarcomm.com/playbooks/bcps-tag-manager-governance', '2026-11-07 Added by Logan', now(), now()
where not exists (select 1 from public.bcps_assignment_tags where assignment_slug='tag-manager-governance');

insert into public.bcps_assignment_notes (assignment_slug, note_text, author)
select 'tag-manager-governance', 'Nov 5 to 7 session wrap-up. Done: governance model set (Sean: Edit not Publish, open and close dates, intake on file); Tag Register live (/?page=tag-register) with the District tags, Finalsite''s container and the Magnet/Brkthru request; workspace review live (bcps-gtm-setup v9); Tag Manager Guide live (/tag-manager-guide), narrated in Sean''s voice, 16 clips in the recording queue for approval. Open: reply to Magnet not confirmed sent; CSP may block ad scripts (agency tests in Preview); owner of G-B601R4LMEG unknown (ask Finalsite); remarketing answer may need a privacy review. Next: Monday Nov 9, confirm or send the Magnet reply.', 'Logan'
where not exists (select 1 from public.bcps_assignment_notes where assignment_slug='tag-manager-governance' and note_text like 'Nov 5 to 7 session wrap-up%');

-- Playbook gate: Sean only (District admins always pass)
insert into public.bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
select 'bcps-tag-manager-governance', 'Sean A. Russell', 'sean.russell@browardschools.com', 'auto'
where not exists (select 1 from public.bcps_brief_recipients where brief_slug='bcps-tag-manager-governance' and attendee_email='sean.russell@browardschools.com');

insert into public.playbook_records (slug, brand_slug, author, kind, source, applied, body)
select 'bcps-tag-manager-governance', 'bcps', 'logan', 'edit', 'text', true,
 'Playbook created: bcps-tag-manager-governance (Google Tag Manager Governance), from the bcps-doc-project-playbook template via bcps-google-account-security. Recipients: 1 (Sean A. Russell); admins pass. Linked Web Team Assignment: tag-manager-governance. URL: https://bcpsmarcomm.com/playbooks/bcps-tag-manager-governance'
where not exists (select 1 from public.playbook_records where slug='bcps-tag-manager-governance' and body like 'Playbook created: bcps-tag-manager-governance%');

insert into public.studio_projects (id, slug, name, brand_slug, scope, status, owner_role, owner_label, unread, source, position, created_at, updated_at)
select gen_random_uuid(), 'bcps-tag-manager-governance', 'Google Tag Manager Governance', 'bcps', 'How the District governs Google Tag Manager on browardschools.com, and the Magnet agency request.', 'inprod', 'sar', 'SAR', 0, 'auto', 10, now(), now()
where not exists (select 1 from public.studio_projects where slug='bcps-tag-manager-governance');

insert into public.stream_events (owner, station, summary, keywords, status, context_link)
select 'logan','bcps','Tag Manager governance wrapped for Monday pick-up: playbook bcps-tag-manager-governance filed (gated to Sean), Web Team Assignment tag-manager-governance added with where-it-stands and the next step (confirm or send the Magnet reply, Mon Nov 9), session note on the assignment.',
 array['bcps','gtm','governance','handoff','web-team-assignments','playbook'],'completed','https://bcpsmarcomm.com/playbooks/bcps-tag-manager-governance'
where not exists (select 1 from public.stream_events where summary like 'Tag Manager governance wrapped for Monday pick-up%');

-- Handoff checkpoint read by the next session ("pick up Tag Manager governance")
insert into public.brief_checkpoints (brand_slug, station, account, status, session_label, summary, files_touched, next_step, open_items, handoff_url)
select 'bcps', 'claude-code-cloud', 'vegan@lesaruss.com', 'handed_off', 'Google Tag Manager governance',
 'Google Tag Manager governance for browardschools.com, Nov 5 to 7. One District container (GTM-NTGC6X38); agencies get Edit in their own workspace, District reviews and publishes, access opens and closes on set dates. Live: Tag Register (/?page=tag-register, tables bcps_gtm_access and bcps_gtm_tags), workspace review (bcps-gtm-setup v9, action review), narrated Tag Manager Guide (/tag-manager-guide) in Sean''s voice (16 clips, recording_queue batch gtm-guide). PRs lesaruss/bcpsmarcomm 244, 246, 255 merged. Magnet & Innovative Programs request: reply with 11 intake questions drafted (in the playbook); Brkthru (to confirm) in the Tag Register as Waiting for intake. Logged: playbook bcps-tag-manager-governance (gated to Sean), Web Team Assignment tag-manager-governance.',
 to_jsonb(array['src/components/pages/TagRegisterPage.tsx','src/app/api/bcps/tag-register/route.ts','src/app/tag-manager-guide/','public/audio/gtm-guide/','supabase/functions/bcps-gtm-setup/index.ts','supabase/migrations/20261105_bcps_gtm_tag_register.sql','supabase/migrations/20261106_bcps_gtm_guide_recording_queue.sql']),
 'First, ask Sean whether the reply to Magnet went out. If not, give him the reply from the playbook (Resources, Reply to Magnet). When Magnet answers: fill Brkthru in the Tag Register, Sean invites the agency in Tag Manager with Edit, Open access, then set a close-out reminder for the campaign end date.',
 to_jsonb(array['Sean: confirm or send the Magnet reply (Mon Nov 9)','Record intake answers in the Tag Register (Brkthru record)','Sean: invite agency users in Tag Manager with Edit, then Open access','Logan: close-out reminder once the campaign end date is known','On "ready to publish": Logan runs bcps-gtm-setup action review on their workspace, Sean publishes','Agency tests in Preview: site CSP may block ad scripts (fix sits with Finalsite)','Sean: ask Finalsite who owns G-B601R4LMEG','If remarketing = yes: decide on a District privacy review','Sean: listen to the guide narration and approve the 16 recording_queue clips']),
 'https://bcpsmarcomm.com/playbooks/bcps-tag-manager-governance'
where not exists (select 1 from public.brief_checkpoints where session_label='Google Tag Manager governance' and brand_slug='bcps');
