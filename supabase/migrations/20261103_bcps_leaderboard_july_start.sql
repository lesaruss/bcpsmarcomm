-- Sean, 2026-11-03: July 1 starts the new fiscal quarter, so the leaderboard's
-- school year starts July 1 (this reverses the August start from
-- 20261103_bcps_leaderboard_august_start.sql, whose August Hot Lab rows stay).
-- Re-creates both functions with the July 1 default, then loads the July Hot
-- Labs from each note's "Who Attended" list (Sean and Felicia Hicks are the
-- District Web Team and are not counted).
do $$
declare r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('bcps_wcm_leaderboard', 'bcps_wcm_leaderboard_summary')
  loop
    execute replace(pg_get_functiondef(r.oid), '2026-08-01', '2026-07-01');
  end loop;
end $$;

insert into public.bcps_attendance (email, event_type, event_date, event_key, source)
select v.email, 'hot_lab', v.d::date, v.k, 'meeting-note-body' from (values
  ('lorena.balharry@browardschools.com','2026-07-01','bcps-hot-lab-dept-wcms-2026-07-01'),
  ('angela.tillman@browardschools.com','2026-07-01','bcps-hot-lab-dept-wcms-2026-07-01'),
  ('ronee.stratman@browardschools.com','2026-07-01','bcps-hot-lab-dept-wcms-2026-07-01'),
  ('allan.llanos@browardschools.com','2026-07-01','bcps-hot-lab-dept-wcms-2026-07-01'),
  ('patricia.sapp@browardschools.com','2026-07-02','bcps-hot-lab-dept-wcms-2026-07-02'),
  ('matthew.cordova@browardschools.com','2026-07-02','bcps-hot-lab-dept-wcms-2026-07-02'),
  ('angela.tillman@browardschools.com','2026-07-02','bcps-hot-lab-dept-wcms-2026-07-02'),
  ('lorena.balharry@browardschools.com','2026-07-14','bcps-hot-lab-dept-wcms-2026-07-14'),
  ('celia.jimenez@browardschools.com','2026-07-14','bcps-hot-lab-dept-wcms-2026-07-14'),
  ('patricia.sapp@browardschools.com','2026-07-14','bcps-hot-lab-dept-wcms-2026-07-14'),
  ('marcia.dixon@browardschools.com','2026-07-14','bcps-hot-lab-dept-wcms-2026-07-14'),
  ('jhonii.p.louis@browardschools.com','2026-07-16','bcps-hot-lab-dept-wcms-2026-07-16'),
  ('patricia.sapp@browardschools.com','2026-07-16','bcps-hot-lab-dept-wcms-2026-07-16'),
  ('celia.jimenez@browardschools.com','2026-07-16','bcps-hot-lab-dept-wcms-2026-07-16'),
  ('angela.tillman@browardschools.com','2026-07-16','bcps-hot-lab-dept-wcms-2026-07-16'),
  ('angela.tillman@browardschools.com','2026-07-21','bcps-hot-lab-dept-wcms-2026-07-21'),
  ('marcia.dixon@browardschools.com','2026-07-21','bcps-hot-lab-dept-wcms-2026-07-21')
) as v(email,d,k)
on conflict (email, event_key) do nothing;
