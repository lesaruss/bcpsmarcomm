-- Proud Points embed with no sign-in (Sean, 2026-10-09): it sits on the
-- Finalsite WCM Community page like the other widgets and must open straight
-- to the form. Each browser gets a private guest key (lib/proudPointsApi.ts),
-- which owns that browser's drafts and photos; the WCM types a name and a
-- district email when sending. owner_key is the signed-in email or
-- 'guest:<key>'. client_ip feeds the rate limits on photos and sends.
alter table public.bcps_proud_point_submissions add column if not exists owner_key text;
alter table public.bcps_proud_point_submissions add column if not exists submitter_name text;
alter table public.bcps_proud_point_submissions add column if not exists client_ip text;
alter table public.bcps_proud_point_photos add column if not exists client_ip text;
update public.bcps_proud_point_submissions set owner_key = lower(wcm_email) where owner_key is null and wcm_email is not null;
create unique index if not exists bcps_pp_one_draft_owner on public.bcps_proud_point_submissions (owner_key, school_location_nbr) where status = 'draft';
create index if not exists bcps_pp_sub_owner_idx on public.bcps_proud_point_submissions (owner_key);
create index if not exists bcps_pp_sub_ip_idx on public.bcps_proud_point_submissions (client_ip, created_at);
create index if not exists bcps_pp_photo_ip_idx on public.bcps_proud_point_photos (client_ip, created_at);
