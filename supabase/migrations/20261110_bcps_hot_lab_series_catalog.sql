-- Hot Lab notes from Oct 29 to Nov 10 were filed but never added to the Hot Lab
-- series catalog, so they were missing from the dashboard's Hot Lab card and
-- only opened for the people who attended. Adding them to the series gives
-- every Department WCM (series grant) access and lists them in the Hot Lab
-- library (Sean, 2026-11-10). Applied through execute_sql the same day.
insert into acl_objects (icon, kind, slug, brand, title, doc_url, section, doc_date, doc_type, featured, owner_id, sensitive, series_id, visibility, description, doc_date_sort)
select '📝','document', v.slug,'bcps', v.title, '/playbooks/wcm-hot-labs/'||v.slug, 'meeting-notes', v.dd, 'Meeting Notes', false, '12404ad5-3e28-457b-9439-992eaaecf01d', false, '158c496c-7964-407c-8015-4001ceddafdf', 'restricted', v.descr, v.ds::date
from (values
 ('bcps-hot-lab-dept-wcms-2026-10-29','Hot Lab for Department WCMs - October 29, 2026','October 29, 2026','2026-10-29','Support session the day before the certification deadline: audit pages that belong to another office, how the two-column check is read, out-of-date content, a tooltip request, and what happens after the deadline.'),
 ('bcps-hot-lab-dept-wcms-2026-11-03','Hot Lab for Department WCMs - November 3, 2026','November 3, 2026','2026-11-03','Working session on the audit: feedback on how the audit steps should look (guided, one step at a time), items that are allowed but still flagged, how help with an item works, a transparent logo beside the description, new widgets, and the new Leaderboard.'),
 ('bcps-hot-lab-dept-wcms-2026-11-05','Hot Lab for Department WCMs - November 5, 2026','November 5, 2026','2026-11-05','Certification deadline day, what directors will see, how a department without a website gets one, and the start of the audit rule review: text-heavy images, linked PDFs, heading order, and overview page names.'),
 ('bcps-hot-lab-dept-wcms-2026-11-10','Hot Lab for Department WCMs - November 10, 2026','November 10, 2026','2026-11-10','Audit rule review continued: long blocks of text, links with no text, linking with Internal Link instead of copied addresses, the button standard (information first, then a small button), thirteen rules moved to the Finalsite list, and See it done right examples.')
) v(slug, title, dd, ds, descr)
where not exists (select 1 from acl_objects a where a.slug=v.slug);
