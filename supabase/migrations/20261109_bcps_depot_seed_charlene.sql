-- The Depot's first project (Sean, 2026-11-09): Charlene Collins's walkthrough,
-- the video on her Overview and the eight lines of her guided tour. Stills are
-- in bcps-public/depot/charlene-walkthrough/stills/, the lines in
-- site-audio/bcps/director-tour-N.mp3, the finished video in
-- bcps-public/dashboard-media/. Applied 2026-11-09; idempotent.

with p as (
  insert into bcps_depot_projects (slug, title, kind, audience, surface, status, final_path, poster_path, created_by)
  values ('charlene-walkthrough', 'Charlene''s walkthrough', 'video', 'Charlene Collins, Director, Application Services: what BCPS MarComm shows her and how to stay in the loop',
    'https://bcpsmarcomm.com/?page=dashboard (Start here card and the guided tour)', 'planning',
    'bcps-public/dashboard-media/charlene-walkthrough-v2.mp4', 'bcps-public/dashboard-media/charlene-walkthrough-v2-poster.jpg', 'logan')
  on conflict (slug) do nothing returning id)
insert into bcps_depot_tiles (project_id, position, title, script, stills, audio_path, audio_seconds, checked, status, version, note)
select p.id, n*10, t, s, st::jsonb, 'site-audio/bcps/director-tour-'||n||'.mp3', d, true, 'voiced', 1,
  'Higgsfield seed_audio in Sean''s voice, checked word for word with speech-to-text, tightened and leveled to -16 LUFS (2026-11-09).'
from p, (values
(1,'Welcome',11.1,'Hi Charlene, it''s Sean. Welcome to BCPS MarComm. This is where the District Web Team runs its work, and now you can see all of it. Let me show you around.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t1-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t1-2.jpg","at":4.65}]'),
(2,'Your Overview',10.71,'When you sign in, you land on your Overview. Up top are the numbers that matter: the average accessibility score, the next Hot Lab, and what is waiting in Banners and Proud Points.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t2-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t2-2.jpg","at":2.68}]'),
(3,'Your checklist',6.43,'Below that is your checklist as director. You are not in the day to day, so these five steps keep you in the loop.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t3-1.jpg","at":0}]'),
(4,'Web Team Assignments',13.06,'Start each week with Web Team Assignments. It is every open item the team is carrying, who leads it, where it stands, and anything past its date. You can filter it down to Application Services.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t4-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t4-2.jpg","at":5.62}]'),
(5,'The guide',8.41,'The District Web Team Guide explains how we work, and This Week shows the decisions waiting on the team. You will find it under Documents.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t5-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t5-2.jpg","at":2.99}]'),
(6,'Accessibility',7.34,'The ADA tab shows accessibility across our school sites, the lowest scoring schools, and the scanner your team uses.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t6-1.jpg","at":0}]'),
(7,'Banners and Analytics',8.18,'Banners shows what schools have asked to post on their homepages. Analytics shows how families and staff use browardschools.com.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t7-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t7-2.jpg","at":3.7}]'),
(8,'The final call',11.7,'When the team needs a final call on the site, it comes to you. Have a question or a direction for us? Use the message button, and it comes straight to the team. Glad to have you in here, Charlene.','[{"path":"bcps-public/depot/charlene-walkthrough/stills/t8-1.jpg","at":0},{"path":"bcps-public/depot/charlene-walkthrough/stills/t8-2.jpg","at":5.93}]')
) v(n,t,d,s,st);
