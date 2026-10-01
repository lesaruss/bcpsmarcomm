-- Director Meeting Notes on the BCPS MarComm dashboard (Sean, 2026-10-01).
-- Director notes live in the same managed list as the WCM hub cards, on
-- tab 'director_notes'. department_id scopes a note to one department's
-- director (a review meeting recap); null means every director sees it.
-- /api/bcps/home reads these with the service role and only returns notes
-- the director can open, so signed-in clients no longer read director_*
-- rows directly (their titles can name a department).
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-10-01.
alter table public.bcps_wcm_hub_items drop constraint if exists bcps_wcm_hub_items_tab_check;
alter table public.bcps_wcm_hub_items add constraint bcps_wcm_hub_items_tab_check
  check (tab in ('start', 'build', 'maintain', 'compliance', 'learn', 'director_notes'));

alter table public.bcps_wcm_hub_items
  add column if not exists department_id uuid references public.bcps_departments(id) on delete cascade;

drop policy if exists "signed-in read live hub items" on public.bcps_wcm_hub_items;
create policy "signed-in read live hub items" on public.bcps_wcm_hub_items
  for select to authenticated
  using (state = 'live' and tab not like 'director\_%');
