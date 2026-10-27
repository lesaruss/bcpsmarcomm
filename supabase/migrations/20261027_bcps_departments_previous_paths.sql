-- Earlier site paths whose GA4 traffic still belongs to a department (Sean,
-- Oct 27 Hot Lab). bcps-ga4-sync v31 credits them to the department under its
-- current path. Magnet & Innovative Programs moved from strategy-innovation to
-- academics in summer 2026.
alter table public.bcps_departments add column if not exists previous_paths text[] not null default '{}';
comment on column public.bcps_departments.previous_paths is 'Earlier site paths (e.g. /bcps-departments/strategy-innovation/magnet-programs) whose GA4 traffic still belongs to this department. bcps-ga4-sync (v31+) credits them to it. Sean, 2026-10-27.';
update public.bcps_departments set previous_paths = array['/bcps-departments/strategy-innovation/magnet-programs'], updated_at = now()
where id = 'b272b4d5-a9b1-4e19-bdd8-49a5838e9848' and not ('/bcps-departments/strategy-innovation/magnet-programs' = any(previous_paths));
