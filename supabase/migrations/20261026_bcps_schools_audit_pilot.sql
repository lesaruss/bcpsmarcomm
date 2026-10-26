-- School audit pilot (Sean, 2026-10-26): every school has its website now, but
-- full-site audits run only for schools on the pilot list until Sean opens it
-- up. /api/bcps/site-audit (Run audit) and /api/bcps/school-sitemap (ADA
-- Manager's full-site scan) refuse a school that is not on it. Add a school:
--   update public.bcps_schools set audit_pilot = true where school_location_nbr = '<loc>'
alter table public.bcps_schools add column if not exists audit_pilot boolean not null default false;
update public.bcps_schools set audit_pilot = true where school_location_nbr = '3081';
