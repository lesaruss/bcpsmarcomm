-- Sean, 2026-11-03: confirmed the Sept 8 first-name-only attendees (Alan, Ronnie,
-- Erica are Allan Llanos, Ronee Stratman, Erica Sawyer), counted Vince Watson on
-- Sept 3 even though he stayed briefly, and removed the duplicate roster entry
-- for Leon Clinch (lclinch@ is his email; leon.clinch@ was the extra, listed
-- under Talent Management). Already applied to production.
insert into public.bcps_attendance (email, event_type, event_date, event_key, source)
select v.email, 'hot_lab', v.d::date, v.k, 'meeting-note-body' from (values
  ('vince.watson@browardschools.com','2026-09-03','bcps-hot-lab-dept-wcms-2026-09-03'),
  ('allan.llanos@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08'),
  ('ronee.stratman@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08'),
  ('erica.sawyer@browardschools.com','2026-09-08','bcps-hot-lab-dept-wcms-2026-09-08')
) as v(email,d,k)
on conflict (email, event_key) do nothing;

delete from public.bcps_attendance where email = 'leon.clinch@browardschools.com';
delete from public.bcps_wcm_roster_members
 where id = '73b2778c-a570-45ff-9256-52d031799935' and lower(wcm_email) = 'leon.clinch@browardschools.com';
