-- WCM Pilot Review login (Sean, 2026-11-16). /school-registration only creates
-- an account when the email matches the school's bcps_schools.wcm_email. 13 of
-- the 15 pilot schools had none on file, so those WCMs would have been told
-- "This email is not on file". Fill them from the pilot list; never overwrite
-- a WCM already on file. Applied to production 2026-11-16 (13 rows).
update public.bcps_schools s
   set wcm_email = m.email, wcm_name = m.full_name, updated_at = now()
  from public.bcps_pilot_review_members m
 where ltrim(s.school_location_nbr, '0') = ltrim(m.loc_no, '0')
   and s.wcm_email is null;
