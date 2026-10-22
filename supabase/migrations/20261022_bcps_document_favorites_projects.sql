-- Documents (Sean and Vanessa, 2026-10-22).
--
-- 1. Favorites are per person. acl_objects.featured was one flag for
--    everyone, set only by admins, so Sean's stars showed for Vanessa and her
--    star did nothing. Each person now keeps their own list; Sean's current
--    stars carry over as his.
-- 2. Documents can belong to a project (BCPS Central, School Websites, ...)
--    so the Documents page can filter by project as well as by type.
-- 3. The School Website Service Model Playbook, its School Assignments
--    2026-27 doc (who on Application Services covers which schools) and
--    BCPS Central V2 join the Documents list for the District Web Team.
-- 4. Website Management Center is BCPS Central; the scope review says so.

create table if not exists public.bcps_document_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);
alter table public.bcps_document_favorites enable row level security;

insert into public.bcps_document_favorites (user_id, slug)
select u.id, o.slug
from public.acl_objects o
cross join auth.users u
where o.brand = 'bcps' and o.kind = 'document' and o.featured
  and lower(u.email) in ('contact@lesaruss.com', 'sean.russell@browardschools.com')
on conflict do nothing;

alter table public.acl_objects add column if not exists project text;

update public.acl_objects
set title = 'BCPS Central: Website Management Center Scope Review (Schools)', project = 'BCPS Central', updated_at = now()
where brand = 'bcps' and kind = 'document' and slug = 'bcps-wcm-scope-2026';

insert into public.acl_objects (brand, kind, slug, title, description, doc_type, doc_date, doc_date_sort, icon, section, visibility, sensitive, owner_id, doc_url, project)
select 'bcps', 'document', v.slug, v.title, v.description, v.doc_type, v.doc_date, v.doc_date_sort::date, v.icon, 'documents', 'restricted', false,
       (select id from auth.users where lower(email) = 'contact@lesaruss.com'), v.doc_url, v.project
from (values
  ('bcps-central-v2', 'BCPS Central V2', 'The dashboards phase of BCPS Central: where it stands, the work queue and the decision history. Meeting notes are filed here.', 'Playbook', 'October 22, 2026', '2026-10-22', '📘', '/playbooks/bcps-central-v2', 'BCPS Central'),
  ('school-website-service-model', 'School Website Service Model', 'Application Services as the WCM for every school: the service model, who covers which schools, and how it rolls out.', 'Playbook', 'October 2, 2026', '2026-10-02', '📘', '/playbooks/school-website-service-model', 'School Websites'),
  ('bcps-school-assignments-2026-27', 'School Assignments 2026-27', 'Who on the District Web Team covers which schools for 2026-27, under the School Website Service Model.', 'Planning', 'October 2, 2026', '2026-10-02', '🏫', '/playbooks/school-website-service-model/bcps-school-assignments-2026-27', 'School Websites')
) as v(slug, title, description, doc_type, doc_date, doc_date_sort, icon, doc_url, project)
where not exists (select 1 from public.acl_objects x where x.brand = 'bcps' and x.kind = 'document' and x.slug = v.slug);

insert into public.acl_grants (object_id, subject_type, subject_id, role)
select o.id, 'group', g.id, 'view'
from public.acl_objects o
join public.acl_groups g on g.brand = 'bcps' and g.slug = 'dwt'
where o.brand = 'bcps' and o.kind = 'document'
  and o.slug in ('bcps-central-v2', 'school-website-service-model', 'bcps-school-assignments-2026-27')
  and not exists (select 1 from public.acl_grants x where x.object_id = o.id and x.subject_type = 'group' and x.subject_id = g.id);

-- Assignment pop-up (2026-10-22): a Widget link beside the Playbook link.
alter table public.bcps_assignment_tags add column if not exists widget_url text;
insert into public.bcps_assignment_tags (assignment_slug, widget_url, updated_at)
select v.slug, v.url, now() from (values
  ('automate-rejected-banners', '/?page=banner-submissions'),
  ('pride-points-submission-form', '/?page=proud-points'),
  ('audioeye', '/?page=ada-scanner'),
  ('wcm-dept-roster', '/?page=wcm-roster'),
  ('widget-iidl-services', '/?page=widgets'),
  ('widget-program-directory', '/?page=widgets'),
  ('dept-programs-directory', '/?page=widgets'),
  ('charter-schools', '/?page=widgets')
) as v(slug, url)
on conflict (assignment_slug) do update set widget_url = excluded.widget_url, updated_at = excluded.updated_at
where public.bcps_assignment_tags.widget_url is null;
update public.bcps_assignment_tags set playbook_url = 'https://bcpsmarcomm.com/playbooks/banner-submission-app', updated_at = now()
where assignment_slug = 'automate-rejected-banners' and playbook_url is null;
