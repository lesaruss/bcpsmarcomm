-- II&DL Services Directory: optional second button per service (Alex Macri,
-- 2026-11-24). Instructional Technology services, except Substitute Support,
-- get a "Find Your ITF" button linking to the ITF lookup form.
alter table public.bcps_iidl_services
  add column if not exists extra_link_label text,
  add column if not exists extra_link_url text;

grant select (extra_link_label, extra_link_url) on public.bcps_iidl_services to anon, authenticated;

update public.bcps_iidl_services
   set extra_link_label = 'Find Your ITF',
       extra_link_url = 'https://airtable.com/app52kldCGyo8tS18/shrpKbrDKAhYSnFjc/tblQA9JdFGbNQ9OeE?backgroundColor=teal&viewControls=on',
       updated_at = now()
 where unit_slug = 'instructional-technology'
   and name <> 'Substitute Support';
