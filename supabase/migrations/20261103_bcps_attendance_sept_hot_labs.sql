-- Hot Lab attendance for Sept 1, 3 and 8 (Sean, 2026-11-03). Those notes have
-- no bcps_brief_recipients rows, so the attendees are read from each note's
-- "Who Attended" list. Not counted: Sean and Felicia Hicks (District Web Team);
-- Vince Watson on Sept 3 (joined briefly on mobile, did not stay); and the
-- first-name-only entries on Sept 8 (Alan, Ronnie, Erica) until confirmed.
-- Leon Clinch is on the roster under two emails, so both carry the row.
insert into public.bcps_attendance (email, event_type, event_date, event_key, source)
select v.email, 'hot_lab', v.d::date, v.k, 'meeting-note-body' from (values
 ('jhonii.p.louis@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('patricia.sapp@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('lacresha.cooper@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('allan.llanos@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('lorena.balharry@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('tanya.jose@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('lilia.durham@browardschools.com','2026-09-01','bcps-hot-lab-dept-wcms-2026-09-01'),
 ('matthew.cordova@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('allan.llanos@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('jennifer.amador@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('ronee.stratman@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('lorena.balharry@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('leon.clinch@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('lclinch@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('patricia.sapp@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('erica.sawyer@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
 ('lorena.balharry@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08'),
 ('patricia.sapp@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08'),
 ('marcia.dixon@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08')
) as v(email,d,k)
on conflict (email, event_key) do nothing;
