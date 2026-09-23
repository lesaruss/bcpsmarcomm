-- WCM Roster: record departments that have no website.
-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-09-23.
--
-- Sean, 2026-09-23: some roster departments have no department website, so
-- they need no WCM and their directors are not part of roster outreach.
-- There was nowhere to record that, so those departments looked like they
-- were still waiting on a director. Flagged here rather than deleted, so the
-- decision is visible and reversible.
alter table public.bcps_wcm_roster add column if not exists no_website boolean not null default false;
alter table public.bcps_wcm_roster add column if not exists no_website_note text;
