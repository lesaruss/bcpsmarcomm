-- Sean, 2026-11-03: the school year for the leaderboard starts August 1, not
-- July 1, so the July Hot Labs do not count. Re-creates both functions with
-- the new default start date, then loads the August Hot Labs from the notes
-- (Aug 18, 20, 25). Only people who are clearly identified are loaded:
--   Aug 18: the WCMs who asked or noted something in the narrative.
--   Aug 20: the attendee list; Johnny is Jhonii Louis (Office of Student
--           Services), Ronnie is Ronee Stratman, Patricia and Marcia match
--           one roster member each.
--   Aug 25: the attendee list; Fanny and Vince match one roster member each
--           by department. Katrina (a school WCM who joined by mistake) is
--           not counted.
--   Aug 27: the note names no WCMs.
do $$
declare r record;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('bcps_wcm_leaderboard', 'bcps_wcm_leaderboard_summary')
  loop
    execute replace(pg_get_functiondef(r.oid), '2026-07-01', '2026-08-01');
  end loop;
end $$;

insert into public.bcps_attendance (email, event_type, event_date, event_key, source)
select v.email, 'hot_lab', v.d::date, v.k, 'meeting-note-body' from (values
  ('angelique.lynch@browardschools.com','2026-08-18','bcps-hot-lab-dept-wcms-2026-08-18'),
  ('jennifer.amador@browardschools.com','2026-08-18','bcps-hot-lab-dept-wcms-2026-08-18'),
  ('marcia.dixon@browardschools.com','2026-08-18','bcps-hot-lab-dept-wcms-2026-08-18'),
  ('matthew.cordova@browardschools.com','2026-08-18','bcps-hot-lab-dept-wcms-2026-08-18'),
  ('patricia.sapp@browardschools.com','2026-08-18','bcps-hot-lab-dept-wcms-2026-08-18'),
  ('ronee.stratman@browardschools.com','2026-08-20','bcps-hot-lab-dept-wcms-2026-08-20'),
  ('patricia.sapp@browardschools.com','2026-08-20','bcps-hot-lab-dept-wcms-2026-08-20'),
  ('jhonii.p.louis@browardschools.com','2026-08-20','bcps-hot-lab-dept-wcms-2026-08-20'),
  ('marcia.dixon@browardschools.com','2026-08-20','bcps-hot-lab-dept-wcms-2026-08-20'),
  ('lorena.balharry@browardschools.com','2026-08-25','bcps-hot-lab-dept-wcms-2026-08-25'),
  ('marcia.dixon@browardschools.com','2026-08-25','bcps-hot-lab-dept-wcms-2026-08-25'),
  ('fricketts@browardschools.com','2026-08-25','bcps-hot-lab-dept-wcms-2026-08-25'),
  ('vince.watson@browardschools.com','2026-08-25','bcps-hot-lab-dept-wcms-2026-08-25')
) as v(email,d,k)
on conflict (email, event_key) do nothing;
