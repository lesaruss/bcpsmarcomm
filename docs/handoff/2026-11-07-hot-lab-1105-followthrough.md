# Handoff, 2026-11-07: Nov 5 Hot Lab follow-through

Brand bcps, repo lesaruss/bcpsmarcomm, Supabase project fwbhwfxpncrsfhttimna. Logan builds, Sean decides.

**Start here Monday:** Web Team Assignments, row `monday-pickup-nov-9` ("Monday pickup: Nov 5 Hot Lab follow-through (start here)"). In the chat, say: "pick up the Nov 5 Hot Lab follow-through from Web Team Assignments."

## Open, in order
1. **Certification wrap-up email** (`cert-congrats-message`). Campaign `cert-update-2026-11-06` on the Certification page, Outreach tab, `/?page=cert-followup`. Live on production (PR 248), 77 roster WCMs checked, **not sent** as of Nov 7. Before sending, update two lines in `updateEmail` in `src/lib/bcps-cert-followup-email.ts`: "closed yesterday, Thursday, November 5" and "Starting Monday, November 9, access ... is paused" (Sean picks the new pause date). Sends on click only.
2. **Campaign menu** (`outreach-campaign-menu-schedule`). Built and pushed, not merged: commit 0a66502 on `claude/sharp-shannon-4skohw`. Pending campaigns (`READY_CAMPAIGNS` in `src/lib/bcps-cert-followup-groups.ts`) show first in the Campaign menu; a stale list response is dropped. Merge on Sean's word. **Scheduled send not built**: plan is a send-at time per campaign, sent by the existing pg_cron job that calls `/api/bcps/email-streams/run`, listed and cancellable on the page.
3. **Audit team tools** (`audit-hub`, `still-stuck-queue-visibility`). Live (PR 252): `src/components/bcps/AuditTeamTools.tsx` at the top of the Run Audit tab for SuperAdmin and the District Web Team. The still-stuck API (`/api/bcps/audit-questions`) now admits the `audit-rules-review` page grant. Not yet seen signed in. 9 open questions.
4. **Audit Rule Review decisions** (`audit-followups-nov-3`). 0 of 36 rules decided. Sean's Nov 5 calls: text-heavy images keep; linked PDFs change once the PDF tool exists; headings need input; overview page keep.
5. **Heading size mock-ups** (`heading-sizes`) for the Tuesday, Nov 10 Hot Lab.
6. **Nov 5 recording** (`department-hot-labs`): add the link to `bcps-hot-lab-dept-wcms-2026-11-05` in `briefings`.

## Decided Nov 5 and 6
- The audit is a component in each hub with a view per role, not an Audit Hub and not a widget (widgets are public embeds).
- Post-audit meeting is about marketing; schedule once the audit is complete; WCM required, director encouraged.
- Access comes off Monday for WCMs not certified (replaces the Oct 29 "no blanket shutoff" note).
- Every task lives in a playbook; with no playbook, `bcps-feedback`.

## Records
- Migrations: `20261105_bcps_hot_lab_1105.sql`, `20261105_bcps_hot_lab_1105_tracker.sql`, `20261107_bcps_monday_pickup.sql`.
- Hot Lab note written through the one-time function `ve-once-hotlab-1105` (now a 410 stub, verify_jwt true).
