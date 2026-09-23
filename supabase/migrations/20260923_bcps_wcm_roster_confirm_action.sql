-- WCM Roster: let a director confirm the roster as-is.
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-23.
--
-- 2026-09-23: two directors reported the roster form "does nothing" on Submit.
-- The form tells a director whose WCM is still correct to "leave as-is,
-- nothing to do", then refused to submit unless something was added or
-- removed, and printed that refusal at the top of the page, off-screen from
-- the button. No submission had landed since 2026-09-16.
--
-- 'confirm' records that the director reviewed the WCM(s) on file and they
-- stand for 2026/27. Approving it changes no member rows; it updates the
-- director of record and sends the director confirmation, like 'na'.
alter table public.bcps_wcm_roster_submissions
  drop constraint if exists bcps_wcm_roster_submissions_action_check;
alter table public.bcps_wcm_roster_submissions
  add constraint bcps_wcm_roster_submissions_action_check
  check (action = any (array['add'::text, 'remove'::text, 'na'::text, 'confirm'::text]));
