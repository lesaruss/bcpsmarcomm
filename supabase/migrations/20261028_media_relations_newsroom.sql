-- Media Relations is the newsroom (Sean, 2026-10-28: "count the newsroom for
-- Media Relations"). Its old address /bcps-departments/newsroom redirects to
-- /about-us/news-room, outside /bcps-departments/; bcps-ga4-sync v36 reads
-- department addresses outside that section too. The audit's main page
-- follows the address so its results stay with it.
update bcps_site_pages p set url = 'https://www.browardschools.com/about-us/news-room', last_seen_at = now()
where p.department_id = '669d2a8a-f693-4ba0-914b-5d24457272c4' and p.is_main
  and rtrim(p.url, '/') = 'https://www.browardschools.com/bcps-departments/newsroom'
  and not exists (select 1 from bcps_site_pages q where q.department_id = p.department_id and rtrim(q.url, '/') = 'https://www.browardschools.com/about-us/news-room');
update bcps_departments
set website_url = 'https://www.browardschools.com/about-us/news-room',
    previous_paths = (select array_agg(distinct x) from unnest(previous_paths || array['/bcps-departments/newsroom']) x),
    updated_at = now()
where id = '669d2a8a-f693-4ba0-914b-5d24457272c4';
