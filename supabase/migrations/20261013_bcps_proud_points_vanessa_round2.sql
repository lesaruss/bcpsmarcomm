-- Proud Points, round 2 (Vanessa Deslandes feedback, 2026-10-12).
--
-- 1. The 25/26 website audit decides who sends all six. The BCPS Central
--    checklist "25/26 Incomplete Component: Proud Points" lists 27 schools
--    with outstanding Proud Points. Those schools send all six; every other
--    school already has six and replaces one at a time. The old form's sheet
--    is no longer used for that call (it put 41 schools that have six into
--    "needs all six", and 8 listed schools into "has six"). A web team
--    override in bcps_proud_point_schools still wins.
-- 2. One background photo per school: the homepage section shows a single
--    photo behind all six points, so the photo moves from each point to the
--    submission. The two open drafts keep the first photo they had.
-- 3. Ideas fit the caption limit (115): 31 ideas were rewritten to fit, and a
--    check keeps new ones within it.

create table if not exists public.bcps_proud_point_audit (
  loc_no text primary key references public.bcps_school_directory(loc_no),
  audit text not null,
  added_at timestamptz not null default now()
);
alter table public.bcps_proud_point_audit enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bcps_proud_point_audit' and policyname = 'bcps_proud_point_audit_service_role_only') then
    create policy bcps_proud_point_audit_service_role_only on public.bcps_proud_point_audit for all
      using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end $$;

insert into public.bcps_proud_point_audit (loc_no, audit)
select v.loc, '25/26 Incomplete Component: Proud Points'
from (values
  ('1741'), -- Boyd H. Anderson HS
  ('0343'), -- Attucks MS
  ('2611'), -- Bair MS
  ('0341'), -- Mary M. Bethune ES
  ('0361'), -- Blanche Ely HS
  ('0871'), -- Bright Horizons
  ('3771'), -- Challenger ES
  ('3222'), -- Cross Creek
  ('3651'), -- Dave Thomas
  ('0911'), -- Deerfield Beach MS
  ('0371'), -- Dillard 6-12
  ('1611'), -- Dr. Martin Luther King, Jr. ES
  ('3391'), -- Charles W. Flanagan HS
  ('0851'), -- Floranada ES
  ('0131'), -- Gulfstream Academy of Hallandale Beach K-8
  ('0581'), -- Margate MS
  ('2231'), -- North Lauderdale ES
  ('1241'), -- Northeast HS
  ('3761'), -- Park Lakes ES
  ('3631'), -- Parkside ES
  ('3031'), -- Riverside ES
  ('1891'), -- Seminole MS
  ('2971'), -- Silver Lakes MS
  ('3331'), -- Silver Trail MS
  ('2351'), -- South Plantation HS
  ('0251'), -- Sunrise MS
  ('0191')  -- Wilton Manors ES
) as v(loc)
on conflict (loc_no) do nothing;

alter table public.bcps_proud_point_submissions
  add column if not exists photo_path text,
  add column if not exists photo_name text,
  add column if not exists photo_alt text;

update public.bcps_proud_point_submissions s
set photo_path = p->>'photo_path', photo_name = p->>'photo_name', photo_alt = nullif(p->>'alt_text', '')
from (
  select id, (select e from jsonb_array_elements(points) e where e->>'photo_path' is not null order by (e->>'slot')::int limit 1) p
  from public.bcps_proud_point_submissions
) f
where f.id = s.id and f.p is not null and s.photo_path is null;

update public.bcps_proud_point_ideas set text = '3rd Place in the national AASHTO Bridge Competition for highway and transportation engineering.' where id = '200a25c6-98b8-49a8-9e77-61d5da9c0a4a' and length(text) > 115;
update public.bcps_proud_point_ideas set text = '1:1 laptops for students, plus cutting-edge classroom technology like VR headsets to enhance learning.' where id = '35eceb7f-df0b-4504-918d-12486b2f9899' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Unique learning experiences on and off campus, including a specialized sensory room and sensory garden.' where id = '5837c358-ef93-46bf-bc84-2013150e4a6c' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Golden School Award recipient for 30+ years for excellence in parent and community volunteerism.' where id = '1b94d671-c7f1-4eca-a4b6-66041241aa63' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'An inclusive environment with ACCEL, Gifted, ESE, and Tier 2 and Tier 3 support for every learner.' where id = 'c68a9850-8d0f-4a2b-962b-53c8b4637846' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Over 20 sports teams give students the chance to have fun, build teamwork, and excel athletically.' where id = '3cc4bce9-3df7-4ab5-aa88-339e27d839ef' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Strong support services for students and families, fostering success and well-being.' where id = '19c5fa02-b2fc-4c02-a9bb-856375379258' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Student leaders raised over $35,000 through fundraising, community outreach, and environmental stewardship.' where id = '8d127cce-edb9-4a64-bd90-f9abb6e39bc2' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Wraparound services including speech and language, occupational and physical therapy, and life skills.' where id = 'f2418a2f-582f-45b0-a6e6-05e95f61236a' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Over 70 clubs and activities give students meaningful ways to build a connection with their school.' where id = '0ce3f6fd-55fc-4793-98bc-d2fb7d445d4c' and length(text) > 115;
update public.bcps_proud_point_ideas set text = '60+ student-led organizations, from advocacy groups to nationally recognized Honor Societies.' where id = '82cd229a-5041-45f8-b951-4a768b499556' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Award-winning Speech and Debate team with multiple Top-10 finishes and national recognition.' where id = 'f57642a3-5297-4a16-9933-298a3f4328bf' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Extensive tools give every student access to communication and the ability to process academic content.' where id = 'd585db60-2a22-40ee-b856-e8cd3c8820e1' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Over 35 electives, from art and music to PE, chess, and e-sports: something for every student to discover.' where id = 'dfd554a7-f196-4814-be91-4930206fcb50' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Over 15 unique clubs, including Book Club and Dungeons & Dragons Club, fostering creativity and leadership.' where id = '9f527fc1-a606-4417-80bd-2d415d4a37fe' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'A WATCH D.O.G.S.® school, with over 90 dads volunteering to make a lasting difference for our students.' where id = '5a4e0072-5ff7-459b-a1d4-8be1b848e5a6' and length(text) > 115;
update public.bcps_proud_point_ideas set text = '13 high school-level courses, including Algebra, Foreign Language, and Computer Science.' where id = '690e19c2-ec38-4f36-81c7-539abce9f3a7' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Self-paced learning lets students move at their own pace with the guidance of their teachers.' where id = 'e1429d24-aa62-4f52-931e-7c5437058d6b' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'National Unified Champion Banner School, celebrating inclusion through unified sports and leadership.' where id = 'a3ecb31a-b52b-47ce-9d4e-083ff4894d2f' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Music and chorus programs introduce students to a variety of instruments and provide vocal training.' where id = '23177bc6-d3bf-4d01-9831-d15d77316fed' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Strong athletic teams that excel in competition and promote teamwork and school spirit.' where id = '94e5b9b5-0611-47e4-b6bd-a68df54d33d1' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'A diverse range of clubs helps students explore their passions and develop new skills.' where id = 'e5a047d4-b26e-4fb9-b9ee-f161dc5431ba' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Students earn community service hours through "Good Deed Tuesday" service projects.' where id = '0e256e64-06da-4143-9d39-e3b9cacbdf74' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'BSA math data has risen consistently, and students are showing major growth.' where id = '6a5335de-f62f-41ff-8b6b-9df80800af59' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Annual Transition, Abilities Awareness, and Guardianship Nights support BCPS students and their families.' where id = 'c84b6f2a-a277-47ab-bc09-46dbc3381786' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'A Cambridge-certified school with a rigorous, internationally recognized curriculum for higher education.' where id = '982f7d73-3367-4c10-947c-f7f3308fb981' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'A nurturing, inclusive environment where students build the skills and confidence to lead and succeed.' where id = '12f9d1c8-ca5e-4eac-9c6d-083daae108d2' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Sloan Stevens Grant recipient: students learn tennis and pickleball, building teamwork and fitness.' where id = 'dd624abd-1612-428b-a1a6-2c9b6035b652' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'A specialized math curriculum and interactive, culturally diverse in-school field trips engage learners.' where id = '62da9ef8-b29b-4fcf-b53f-93226ff52716' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'Strong partnerships with families and the local community create a collaborative path to student success.' where id = 'f217b9a6-741b-412e-a1bd-02767633c992' and length(text) > 115;
update public.bcps_proud_point_ideas set text = 'IT Career Pathway students earn industry IT Specialist certifications in HTML & CSS and Microsoft Office.' where id = '46337188-1b4d-4ffb-8914-139fe3ef50d4' and length(text) > 115;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bcps_pp_ideas_caption_len') then
    alter table public.bcps_proud_point_ideas add constraint bcps_pp_ideas_caption_len check (length(text) <= 115);
  end if;
end $$;
