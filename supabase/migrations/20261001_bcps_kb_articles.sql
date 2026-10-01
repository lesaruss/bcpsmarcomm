-- Knowledge base on the dashboard's Tools & Resources tab (Sean, 2026-10-01):
-- articles grouped by topic, searchable, managed here so the team can add
-- or hide an article without a code change. Rule for every row: state
-- 'live' only when href opens for the audience it is shown to. Seeded with
-- the BCPS playbooks that open for any signed-in person today.
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-10-01.
create table if not exists public.bcps_kb_articles (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  title text not null,
  summary text not null,
  href text not null,
  -- Who it is listed for: 'team' (District Web Team), 'wcm', 'director'.
  audience text[] not null default array['team','wcm']::text[],
  state text not null default 'live' check (state in ('live', 'hidden')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bcps_kb_articles enable row level security;
drop policy if exists "signed-in read live kb articles" on public.bcps_kb_articles;
create policy "signed-in read live kb articles" on public.bcps_kb_articles
  for select to authenticated using (state = 'live');
revoke all on public.bcps_kb_articles from anon;
grant select on public.bcps_kb_articles to authenticated;

insert into public.bcps_kb_articles (topic, title, summary, href, audience, sort_order)
select * from (values
  ('Getting started', 'Department Web Content Manager Playbook', 'Everything current for department WCMs: certification, your pages, and who to ask.', '/playbooks/wcm-department', array['team','wcm'], 10),
  ('Getting started', 'What Directors Need to Know', 'The WCM program from a director''s side: what is expected of each department.', '/playbooks/director-department', array['team','wcm','director'], 20),
  ('Getting started', 'WCM Roster and Approvals', 'How a department confirms its WCM and how the team approves roster changes.', '/playbooks/wcm-roster-approvals', array['team','wcm'], 30),
  ('Hot Labs', 'Department WCM Hot Lab', 'Hot Lab notes and recordings, Tuesdays and Thursdays.', '/playbooks/wcm-hot-labs', array['team','wcm'], 10),
  ('Tools and apps', 'Banner Submission App', 'How school banners are submitted, reviewed and posted.', '/playbooks/banner-submission-app', array['team','wcm'], 10),
  ('Tools and apps', 'District Web Team Tools', 'The tools the District Web Team uses and what each one is for.', '/playbooks/district-web-team-tools', array['team'], 20),
  ('Schools', 'Marketing Your Schools Workshop', 'The Marketing Your Schools workshop materials.', '/playbooks/marketing-your-schools-workshop', array['team'], 10)
) as v(topic, title, summary, href, audience, sort_order)
where not exists (select 1 from public.bcps_kb_articles);
