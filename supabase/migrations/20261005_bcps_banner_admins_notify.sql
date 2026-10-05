-- Banner Submissions: who gets the new-submission / removal-request email.
-- Sean, 2026-10-05: every District Web Team member is a banner admin (can
-- review), but only the Application Services team is emailed when a
-- submission comes in. Sean, Felicia Hicks and Farrah Wilson review without
-- the email. Read by /api/banner/submit and /api/banner/removal.
alter table public.bcps_banner_admins
  add column if not exists notify_on_submit boolean not null default true;

update public.bcps_banner_admins
   set notify_on_submit = false
 where lower(email) in (
   'sean.russell@browardschools.com',
   'felicia.hicks@browardschools.com',
   'farrah.wilson@browardschools.com'
 );
