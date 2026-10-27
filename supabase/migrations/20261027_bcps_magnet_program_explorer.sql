-- Magnet Program Explorer widget (Sean, 2026-10-27). Same model as the Charter
-- School Directory: public read-only embed at /embeds/magnet-program-explorer.html,
-- writes through the service role only. Content is transcribed from the BCPS
-- flipbook "Magnet & Innovative Programs: Where Passion Meets Purpose"
-- (online.fliphtml5.com/vnpjr/BCPS_FlipBook_L10). Schools reference the
-- existing bcps_schools rows by location number; that table is service-role
-- only (it carries WCM emails), so the public fields are copied in here.
-- Policies are created only when missing (no DROP: registry
-- SUPABASE-MCP-DELETE-DROP-HOLD).

CREATE TABLE IF NOT EXISTS public.bcps_magnet_themes (
  slug text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'magnet' CHECK (kind IN ('magnet', 'innovative')),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bcps_magnet_schools (
  loc_nbr text PRIMARY KEY,
  name text NOT NULL,
  site_url text,
  address text,
  city text,
  zip text,
  grades text,
  levels text[] NOT NULL DEFAULT '{}',
  region text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bcps_magnet_programs (
  slug text PRIMARY KEY,
  theme_slug text NOT NULL REFERENCES public.bcps_magnet_themes(slug) ON UPDATE CASCADE,
  name text NOT NULL,
  grades_note text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bcps_magnet_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_slug text NOT NULL REFERENCES public.bcps_magnet_programs(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  school_loc text NOT NULL REFERENCES public.bcps_magnet_schools(loc_nbr) ON UPDATE CASCADE ON DELETE CASCADE,
  tracks text[] NOT NULL DEFAULT '{}',
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_slug, school_loc)
);
CREATE INDEX IF NOT EXISTS bcps_magnet_offerings_school_idx ON public.bcps_magnet_offerings (school_loc);

ALTER TABLE public.bcps_magnet_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_magnet_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_magnet_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_magnet_offerings ENABLE ROW LEVEL SECURITY;

DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bcps_magnet_themes', 'bcps_magnet_schools', 'bcps_magnet_programs', 'bcps_magnet_offerings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'public read ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', 'public read ' || t, t);
    END IF;
  END LOOP;
END $p$;

REVOKE ALL ON public.bcps_magnet_themes, public.bcps_magnet_schools, public.bcps_magnet_programs, public.bcps_magnet_offerings FROM anon, authenticated;
GRANT SELECT ON public.bcps_magnet_themes, public.bcps_magnet_schools, public.bcps_magnet_programs, public.bcps_magnet_offerings TO anon, authenticated;


-- Seed (idempotent).
INSERT INTO public.bcps_magnet_themes (slug, name, kind, description, sort_order) VALUES
('aces', 'Achieving Career Excellence for Students (ACES)', 'magnet', 'Focuses on career exploration, allowing students to participate in career-themed instructional models based on their interests and giving them the opportunity to connect their learning and experiences to future career aspirations.', 1),
('advanced-academics', 'Advanced Academics & College Preparatory', 'magnet', 'Rigorous academics, career-driven pathways, and real-world opportunities that prepare students for college, careers, and life. Through industry certifications and advanced coursework, students can customize their educational journey based on their passions and goals.', 2),
('business-technical', 'Business & Technical', 'magnet', 'Equips students with the skills needed to pursue careers in a variety of fields. Many programs offer the opportunity for students to earn industry-recognized certifications and learn directly from experts in the field.', 3),
('communications-languages', 'Communications & Languages', 'magnet', 'Focuses on writing, languages, and broadcast arts. Programs infuse technology and prepare students for careers in broadcasting, marketing, communications, and international business.', 4),
('government-international-affairs', 'Government & International Affairs (Pre-Law)', 'magnet', 'Career exploration for future attorneys, law enforcement officers, and public officials. Students are exposed to real-world experiences in the field of law, criminal justice, and public affairs.', 5),
('ican', 'Integrated Career Academic Networks (iCAN)', 'magnet', 'A new kind of magnet, where every student is involved. Students enroll in an academy of their choosing, and will participate in project-based and blended learning, develop workplace and technology skills, and engage in mentoring by a network of advisors from business industries and postsecondary institutions.', 6),
('montessori', 'Montessori', 'magnet', 'Cultivates individualism, freedom of choice, greater problem-solving ability, and social development in children. At the same time, it promotes academic achievement and peer acceptance in a non-competitive environment. Literature, the arts, history, social issues, civics, economics, science and technology all complement one another in the Montessori curriculum. Activities promote the development of self-expression, self-awareness, critical thinking, commitment, and responsibility.', 7),
('performing-visual-arts', 'Performing & Visual Arts (PVA)', 'magnet', 'Allows students to communicate ideas and feelings through music, 2-D art, 3-D art, theater arts and dance. Through the arts, children solve problems using their special talents. Tapping imagination for creative and unique solutions is key to the effective performing and visual arts program offered by schools. The goal for students is to enrich their lives through an understanding and enjoyment of the arts.', 8),
('medical-health-sciences', 'Medical & Health Sciences', 'magnet', 'Prepares students for future careers in healthcare, biomedical sciences, and medical research through hands-on, STEM-based learning experiences. Students explore anatomy, wellness, biotechnology, patient care, and emerging medical careers while developing critical thinking, leadership, and problem-solving skills through labs, projects, certifications, and real-world applications.', 9),
('aviation-aerospace', 'Aviation & Aerospace', 'magnet', 'Prepares students for future careers in aviation, aerospace, engineering, and emerging technologies through hands-on STEM learning experiences. Students explore flight principles, aerodynamics, drones, aircraft systems, and aerospace technology while developing leadership, teamwork, and problem-solving skills.', 10),
('marine-science', 'Marine Science', 'magnet', 'Immerses students in the study of marine ecosystems, oceanography, aquatic life, and coastal conservation through hands-on scientific investigations and field experiences. Students explore marine biology, water science, environmental stewardship, and emerging maritime careers while developing research, laboratory, and problem-solving skills connected to Florida''s coastal and marine industries.', 11),
('biotechnology', 'Biotechnology', 'magnet', 'Industrial Biotechnology offers students the opportunity to earn an industry certificate along with rigorous content for furthering their education. Students gain knowledge and experiences in the application of biomedical sciences. Course content includes the study of the human body systems, medicine bioinformatics, and the design of medical interventions.', 12),
('engineering-environmental', 'Engineering & Environmental Science', 'magnet', 'Engineering and environmental programs built on the physical sciences, from robotics, rocketry, bridge design and drafting to research, marine biology and Everglades restoration.', 13),
('stem', 'Science, Technology, Engineering & Mathematics (STEM)', 'magnet', 'Empowers students to think critically, solve problems, and explore the world through hands-on learning and discovery. By integrating science, mathematics, and technology, students develop the skills, creativity, and confidence needed for success in an ever-changing world.', 14)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.bcps_magnet_themes (slug, name, kind, description, sort_order) VALUES
('innovative-advanced-academics-and-college-preparatory', 'Advanced Academics and College Preparatory', 'innovative', NULL, 100),
('innovative-aerospace-aircraft-assembler', 'Aerospace/Aircraft Assembler', 'innovative', NULL, 101),
('innovative-artificial-intelligence-ai', 'Artificial Intelligence (AI)', 'innovative', NULL, 102),
('innovative-business-and-technical', 'Business and Technical', 'innovative', NULL, 103),
('innovative-communication-and-languages', 'Communication and Languages', 'innovative', NULL, 104),
('innovative-performing-visual-arts', 'Performing & Visual Arts', 'innovative', NULL, 105),
('innovative-science-technology-engineering-math-stem', 'Science, Technology, Engineering, & Math (STEM)', 'innovative', NULL, 106),
('innovative-sport-academy-entertainment-marketing', 'Sport Academy & Entertainment Marketing', 'innovative', NULL, 107)
ON CONFLICT (slug) DO NOTHING;

-- Name is the district directory's public name; site_url and region come from
-- bcps_schools / bcps_school_directory (service-role tables) by location number.
INSERT INTO public.bcps_magnet_schools (loc_nbr, name, site_url, address, city, zip, grades, levels, region, sort_order)
SELECT v.loc, v.name, s.site_url, v.address, v.city, v.zip, v.grades, v.levels, d.region, v.sort_order
FROM (VALUES
('1791', 'Apollo Middle', '6800 Arthur Street', 'Hollywood', '33024', 'Middle', ARRAY['Middle']::text[], 1),
('2221', 'Atlantic Technical High', '4700 Coconut Creek Parkway', 'Coconut Creek', '33063', 'Technical High', ARRAY['High']::text[], 2),
('0343', 'Attucks Middle', '3500 N 22nd Avenue', 'Hollywood', '33020', 'Middle', ARRAY['Middle']::text[], 3),
('2611', 'Bair Middle', '9100 NW 21st Manor', 'Sunrise', '33322', 'Middle', ARRAY['Middle']::text[], 4),
('2041', 'Beachside Montessori Village', '2230 Lincoln Street', 'Hollywood', '33020', 'PreK-8', ARRAY['Elementary','Middle']::text[], 5),
('0361', 'Blanche Ely High', '1201 NW Sixth Avenue', 'Pompano Beach', '33060', 'High', ARRAY['High']::text[], 6),
('1741', 'Boyd H. Anderson High', '3050 NW 41st Street', 'Lauderdale Lakes', '33309', 'High', ARRAY['High']::text[], 7),
('1681', 'Coconut Creek High', '1400 NW 44th Avenue', 'Coconut Creek', '33066', 'High', ARRAY['High']::text[], 8),
('0231', 'Colbert Museum Magnet', '2701 Funston Street', 'Hollywood', '33020', 'Elementary', ARRAY['Elementary']::text[], 9),
('1871', 'Crystal Lake Middle', '3551 NE 3rd Avenue', 'Pompano Beach', '33064', 'Middle', ARRAY['Middle']::text[], 10),
('1711', 'Deerfield Beach High', '910 Buck Pride Way', 'Deerfield Beach', '33441', 'High', ARRAY['High']::text[], 11),
('0911', 'Deerfield Beach Middle', '701 SE 6th Avenue', 'Deerfield Beach', '33441', 'Middle', ARRAY['Middle']::text[], 12),
('0391', 'Deerfield Park Elementary', '650 SW Third Avenue', 'Deerfield Beach', '33441', 'Elementary', ARRAY['Elementary']::text[], 13),
('0371', 'Dillard High 6-12', '2501 NW 11th Street', 'Fort Lauderdale', '33311', 'Grades 6-12', ARRAY['Middle','High']::text[], 14),
('0861', 'Driftwood Middle', '2751 N 70th Terrace', 'Hollywood', '33024', 'Middle', ARRAY['Middle']::text[], 15),
('0951', 'Fort Lauderdale High', '1600 NE 4th Avenue', 'Fort Lauderdale', '33305', 'High', ARRAY['High']::text[], 16),
('0403', 'Hallandale Magnet High', '720 NW 9th Avenue', 'Hallandale Beach', '33009', 'High', ARRAY['High']::text[], 17),
('1661', 'Hollywood Hills High', '5400 Stirling Road', 'Hollywood', '33021', 'High', ARRAY['High']::text[], 18),
('2121', 'James S. Rickards Middle', '6000 NE Ninth Avenue', 'Oakland Park', '33334', 'Middle', ARRAY['Middle']::text[], 19),
('1701', 'Lauderdale Lakes Middle', '3911 NW 30th Avenue', 'Lauderdale Lakes', '33309', 'Middle', ARRAY['Middle']::text[], 20),
('1391', 'Lauderhill 6-12 STEM-MED', '1901 NW 49th Avenue', 'Lauderhill', '33313', 'Grades 6-12', ARRAY['Middle','High']::text[], 21),
('0581', 'Margate Middle', '500 NW 65th Avenue', 'Margate', '33063', 'Middle', ARRAY['Middle']::text[], 22),
('0341', 'Mary M. Bethune Elementary', '2400 Meade Street', 'Hollywood', '33020', 'Elementary', ARRAY['Elementary']::text[], 23),
('0481', 'McNicol Middle Magnet & STEM', '1602 S 27th Avenue', 'Hollywood', '33020', 'Middle', ARRAY['Middle']::text[], 24),
('1751', 'Miramar High', '3601 SW 89th Avenue', 'Miramar', '33025', 'High', ARRAY['High']::text[], 25),
('1841', 'Mirror Lake Elementary', '1200 NW 72nd Avenue', 'Plantation', '33313', 'Elementary', ARRAY['Elementary']::text[], 26),
('0881', 'New River Middle', '3100 Riverland Road', 'Fort Lauderdale', '33312', 'Middle', ARRAY['Middle']::text[], 27),
('0521', 'North Andrews Gardens Elementary School of the Arts', '345 NE 56th Street', 'Oakland Park', '33334', 'Elementary', ARRAY['Elementary']::text[], 28),
('1241', 'Northeast High', '700 NE 56th Street', 'Oakland Park', '33334', 'High', ARRAY['High']::text[], 29),
('0031', 'Oakland Park Elementary', '936 NE 33rd Street', 'Oakland Park', '33334', 'Elementary', ARRAY['Elementary']::text[], 30),
('0471', 'Olsen Middle', '330 SE 11th Terrace', 'Dania Beach', '33004', 'Middle', ARRAY['Middle']::text[], 31),
('0701', 'Parkway Middle', '3600 NW Fifth Court', 'Lauderhill', '33311', 'Middle', ARRAY['Middle']::text[], 32),
('1451', 'Plantation 6-12', '6901 NW 16th Street', 'Plantation', '33313', 'Grades 6-12', ARRAY['Middle','High']::text[], 33),
('0941', 'Plantation Elementary', '651 NW 42nd Avenue', 'Plantation', '33317', 'Elementary', ARRAY['Elementary']::text[], 34),
('0185', 'Pompano Beach High', '600 NE 13th Avenue', 'Pompano Beach', '33060', 'High', ARRAY['High']::text[], 35),
('0021', 'Pompano Beach Middle', '310 NE Sixth Street', 'Pompano Beach', '33060', 'Middle', ARRAY['Middle']::text[], 36),
('1051', 'Sheridan Technical High', '3775 SW 16th Street', 'Fort Lauderdale', '33312', 'Technical High', ARRAY['High']::text[], 37),
('2971', 'Silver Lakes Middle', '7600 Tam Oshanter Blvd', 'North Lauderdale', '33068', 'Middle', ARRAY['Middle']::text[], 38),
('3581', 'Silver Shores STEAM Academy K-8', '1701 SW 160th Avenue', 'Miramar', '33027', 'K-8', ARRAY['Elementary','Middle']::text[], 39),
('0171', 'South Broward High', '1901 North Federal Highway', 'Hollywood', '33020', 'High', ARRAY['High']::text[], 40),
('2351', 'South Plantation High', '1300 Paladin Way', 'Plantation', '33317', 'High', ARRAY['High']::text[], 41),
('0211', 'Stranahan High', '1800 SW Fifth Place', 'Fort Lauderdale', '33312', 'High', ARRAY['High']::text[], 42),
('0251', 'Sunrise Middle', '1750 NE 14th Street', 'Fort Lauderdale', '33304', 'Middle', ARRAY['Middle']::text[], 43),
('3321', 'Virginia Shuman Young Montessori', '101 NE 11th Avenue', 'Fort Lauderdale', '33301', 'Elementary', ARRAY['Elementary']::text[], 44),
('0321', 'Walker Elementary', '1001 NW Fourth Street', 'Fort Lauderdale', '33311', 'Elementary', ARRAY['Elementary']::text[], 45),
('1071', 'William Dandy Middle', '2400 NW 26th Street', 'Fort Lauderdale', '33311', 'Middle', ARRAY['Middle']::text[], 46),
('1291', 'William T. McFatter Technical High', '6500 Nova Drive', 'Davie', '33317', 'Technical High', ARRAY['High']::text[], 47),
('0191', 'Wilton Manors Elementary IB World', '2401 NE 3rd Avenue', 'Wilton Manors', '33305', 'Elementary', ARRAY['Elementary']::text[], 48)
) AS v(loc, name, address, city, zip, grades, levels, sort_order)
JOIN public.bcps_schools s ON s.school_location_nbr = v.loc
LEFT JOIN public.bcps_school_directory d ON d.loc_no = v.loc
ON CONFLICT (loc_nbr) DO NOTHING;

INSERT INTO public.bcps_magnet_programs (slug, theme_slug, name, grades_note, description, sort_order) VALUES
('aces-plantation-zone', 'aces', 'ACES Plantation Zone', NULL, 'Zone themes: Aerospace; Art & Fashion; Business & Entrepreneurship.', 1),
('aces-northeast-zone', 'aces', 'ACES Northeast Zone', NULL, 'Zone themes: Aviation; Cybersecurity; 2D/3D Art.', 2),
('cambridge-global-communications-academy', 'advanced-academics', 'Cambridge Global Communications Academy', NULL, 'Incorporates the International Cambridge program, challenging students to excel in mathematics, science, and languages. Students experience a rich curriculum that includes debate, public speaking, research, broadcasting, journalism, and information technology. Students graduating with the Cambridge Diploma qualify for the highest level of the Bright Futures Scholarship.', 3),
('cambridge-program', 'advanced-academics', 'Cambridge Program', NULL, 'A pre-university program that includes independent research and creativity in problem solving. Students have the opportunity to earn a Cambridge Advanced International Certificate of Education (AICE) diploma and a chance to earn college credits. Students graduating with the Cambridge Diploma qualify for the highest level of the Bright Futures Scholarships.', 4),
('ib-diploma-program', 'advanced-academics', 'International Baccalaureate Diploma Program', NULL, 'An accelerated liberal arts curriculum designed to meet the needs of the highly motivated and academically talented student. The program is recognized and respected by leading world universities; it aims to broaden students'' educational experience and challenge them to apply their knowledge and skills. Students who earn their IB Diploma qualify for the highest level of the Bright Futures Scholarship.', 5),
('ib-middle-years-program', 'advanced-academics', 'International Baccalaureate Middle Years Program', 'Grades 6-10', 'A sixth through tenth grade internationally standardized course of study for highly motivated and academically talented students.', 6),
('ib-primary-years-program', 'advanced-academics', 'International Baccalaureate Primary Years Program', NULL, 'Prepares students to become active, caring, lifelong learners who demonstrate respect for themselves and others, and have the capacity to participate in the world around them.', 7),
('academy-of-entrepreneurship-and-technology', 'advanced-academics', 'Academy of Entrepreneurship and Technology', NULL, 'Empowers students to innovate, create, and lead in a rapidly evolving world. Through rigorous, project-based learning and advanced coursework in business management, digital design, multi-media (TV production), automotive, aviation, and medical technologies, students develop entrepreneurial mindsets and industry-ready skills.', 8),
('elma', 'advanced-academics', 'The Entrepreneur and Leadership Military Academy (ELMA)', NULL, 'Prepares students for the rigors of college life, while simultaneously building self-confidence, self-esteem, and the ability to lead others.', 9),
('computer-engineering', 'business-technical', 'Computer Engineering', NULL, 'Students use state-of-the-art equipment to learn about careers in computer science and computer engineering. They also learn computer coding, gaming programming, corporate computer applications, software design, and presentation skills.', 10),
('creek-technical-academy', 'business-technical', 'Creek Technical Academy', NULL, 'Students receive a rigorous, hands-on learning experience that blends academic excellence with real-world technical training using advanced learning methods and technology.', 11),
('digital-entrepreneurship-academy', 'business-technical', 'Digital Entrepreneurship Academy', 'Grades 6-8', 'Students learn the essentials of a successful business plan, including start-up and operational activities using the digital arts.', 12),
('edge-academy', 'business-technical', 'Entrepreneurship, Discovery, Growth, Excellence (EDGE) Academy', NULL, 'Through entrepreneurship, discovery, growth, and excellence, students build academic, creative, and leadership skills. EDGE develops transferable skills that connect middle school learning to high school academies and future careers.', 13),
('emerging-computer-technology', 'business-technical', 'Emerging Computer Technology', 'Grades 9-12', 'Students study microcomputer electronics, networking, 3D animation, robotics, graphic design, and multimedia.', 14),
('information-technology', 'business-technical', 'Information Technology', NULL, 'Starts with an introductory computer course, which offers students both fundamental computer concepts and advanced training in Adobe Premiere applications. A Microsoft Office Specialist (MOS) certification course is also offered as part of the magnet enrichment. Students learn how to transform themselves from being users of technology to creators of technology.', 15),
('international-affairs-business', 'business-technical', 'International Affairs & Business', NULL, 'Students become proficient in a second language while gaining knowledge about world affairs and diverse cultures.', 16),
('international-affairs-information-technology', 'business-technical', 'International Affairs with Information Technology', NULL, 'Students engage in learning about global affairs while developing essential skills to successfully compete in a global economy.', 17),
('technical-academies', 'business-technical', 'Technical Academies', NULL, 'Business and technical programs that equip students with the skills needed to pursue careers in a variety of fields. Many programs offer the opportunity for students to earn industry-recognized certifications and learn directly from experts in the field.', 18),
('communications', 'communications-languages', 'Communications', NULL, 'Students learn the many aspects of television and broadcast journalism by taking production courses.', 19),
('artificial-intelligence-and-media', 'communications-languages', 'Artificial Intelligence and Media (AIM)', NULL, 'Students develop skills in video production, content creation, photography, journalism, and graphic design while exploring artificial intelligence, coding, robotics, and video game development, preparing them for the future of media and innovation.', 20),
('pre-law-public-affairs', 'government-international-affairs', 'Pre-Law and Public Affairs', NULL, 'Designed for students who are interested in careers in law, criminal justice, legal office service, and public affairs including teacher education. Online research, mock trials in the school''s own courtroom, and participation as Ghost Jurists in district court proceedings are just a few highlights of this program. Students are exposed to a broad range of law-related issues by teachers, as well as guest speakers and field trips.', 21),
('ican-academies', 'ican', 'iCAN Academies', NULL, NULL, 22),
('montessori-program', 'montessori', 'Montessori Program', NULL, NULL, 23),
('performing-visual-arts-program', 'performing-visual-arts', 'Performing & Visual Arts Program', NULL, NULL, 24),
('medical-health-sciences-program', 'medical-health-sciences', 'Medical & Health Sciences Program', NULL, NULL, 25),
('aviation-aerospace-program', 'aviation-aerospace', 'Aviation & Aerospace Program', NULL, NULL, 26),
('marine-science-program', 'marine-science', 'Marine Science Program', NULL, NULL, 27),
('industrial-biotechnology', 'biotechnology', 'Industrial Biotechnology', NULL, NULL, 28),
('engineering-environmental-science', 'engineering-environmental', 'Engineering & Environmental Science', NULL, 'Classes associated with physical sciences that include engineering, robotics, rocketry, bridge design, drafting, research, and marine biology courses.', 29),
('environmental-science-everglades-restoration', 'engineering-environmental', 'Environmental Science and Everglades Restoration', NULL, 'Engages students in science, technology, and research to address environmental challenges and climate change. Through hands-on learning, field experiences, and community partnerships, students explore environmental management and global issues while developing the skills to become responsible stewards of the earth.', 30),
('engineering', 'engineering-environmental', 'Engineering', NULL, 'Prepares students for future careers in engineering, technology, robotics, and advanced manufacturing through hands-on, project-based learning experiences. Students engage in engineering design challenges, coding, problem-solving, prototyping, and real-world applications while developing creativity, collaboration, and critical-thinking skills connected to emerging industries and innovative technologies.', 31),
('stem-program', 'stem', 'Science, Technology, Engineering, and Mathematics (STEM)', NULL, 'Students investigate mathematical concepts and connections, create inventions, and build rockets with recycled materials. Students study in specialized virtual labs.', 32),
('stem-museum', 'stem', 'STEM Museum', NULL, 'The integration of STEM in the curriculum offers students the opportunity to explore, experiment, explain, and exhibit research through real-world projects.', 33),
('steam-academy', 'stem', 'Science, Technology, Engineering, Aviation, and Mathematics (STEAM) Academy', NULL, 'Enhances learning through a wide variety of STEAM-focused electives and specials, including art, music, band, digital design and 3-D printing, aviation, physical education, environmental stewardship, financial literacy, world travel and introduction to careers, and coding and robotics.', 34),
('science-pre-engineering', 'stem', 'Science / Pre-Engineering', NULL, 'An advanced academic program for students who plan to continue their education in the fields of engineering, science, mathematics, and architecture of technology.', 35),
('stem-med', 'stem', 'STEM / Multi-Level Entrepreneurship Design (STEM/MED)', 'Grades 6-8', 'A rigorous curriculum and an opportunity for industry certification in Microsoft, as well as Advanced Placement (AP) credit in science and mathematics.', 36)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.bcps_magnet_offerings (program_slug, school_loc, tracks, note, sort_order) VALUES
('aces-plantation-zone', '1841', ARRAY['Aerospace & Aviation','E-Commerce & Entrepreneurship','Innovative Arts']::text[], NULL, 1),
('aces-plantation-zone', '1451', ARRAY['Aerospace & Aviation (6-12)','Applied Animation & Digital Design (6-12)','Building Construction Trades (6-12)','E-Commerce & Entrepreneurship (6-12)','Engineering (6-12)','Fashion & Design (6-12)','Public Safety & Leadership Academy (9-12)']::text[], NULL, 2),
('aces-northeast-zone', '0031', ARRAY['Aviation','Cybersecurity','Design']::text[], NULL, 1),
('aces-northeast-zone', '2121', ARRAY['Arts','Aviation & Avionics','Cybersecurity']::text[], NULL, 2),
('aces-northeast-zone', '1241', ARRAY['Aviation & Avionics','Biotechnology','Cybersecurity','Digital Art & Design','Maritime Mechanics']::text[], NULL, 3),
('cambridge-global-communications-academy', '0343', '{}'::text[], NULL, 1),
('cambridge-program', '0951', '{}'::text[], NULL, 1),
('ib-diploma-program', '1711', '{}'::text[], NULL, 1),
('ib-diploma-program', '1751', '{}'::text[], NULL, 2),
('ib-middle-years-program', '0911', '{}'::text[], NULL, 1),
('ib-primary-years-program', '0191', '{}'::text[], NULL, 1),
('academy-of-entrepreneurship-and-technology', '0403', '{}'::text[], NULL, 1),
('elma', '1741', '{}'::text[], NULL, 1),
('elma', '1661', '{}'::text[], NULL, 2),
('computer-engineering', '0021', '{}'::text[], NULL, 1),
('creek-technical-academy', '1681', '{}'::text[], NULL, 1),
('digital-entrepreneurship-academy', '0371', '{}'::text[], NULL, 1),
('edge-academy', '1701', '{}'::text[], NULL, 1),
('emerging-computer-technology', '0371', '{}'::text[], NULL, 1),
('information-technology', '0021', '{}'::text[], NULL, 1),
('international-affairs-business', '1871', '{}'::text[], NULL, 1),
('international-affairs-information-technology', '0185', '{}'::text[], NULL, 1),
('technical-academies', '2221', '{}'::text[], NULL, 1),
('technical-academies', '1291', '{}'::text[], NULL, 2),
('technical-academies', '1051', '{}'::text[], NULL, 3),
('communications', '0021', '{}'::text[], NULL, 1),
('artificial-intelligence-and-media', '0391', '{}'::text[], NULL, 1),
('artificial-intelligence-and-media', '0911', '{}'::text[], NULL, 2),
('artificial-intelligence-and-media', '1711', '{}'::text[], NULL, 3),
('pre-law-public-affairs', '0951', '{}'::text[], NULL, 1),
('pre-law-public-affairs', '1071', '{}'::text[], NULL, 2),
('ican-academies', '0881', ARRAY['Arts & Humanities','Business, Finance, & Entrepreneurship','Engineering & Design','Marine & Biomedical Sciences']::text[], 'An opportunity for every student to participate in exploring various academic and career pathways through their academy courses along with core content classes.', 1),
('ican-academies', '0471', ARRAY['Entertainment Media & Business','Marine Science & Engineering']::text[], 'iCAN Magnet Academies give students the chance to explore their passions, gain hands-on experience, and prepare for future careers through innovative courses, hands-on projects, and community partnerships.', 2),
('ican-academies', '0021', ARRAY['Athletics and Health Sciences','Aviation Technology','Broadcast Arts','Culinary, Entertainment, Hospitality & Tourism']::text[], 'Three academies, each pathway providing hands-on learning, access to state-of-the-art technology, and opportunities to earn industry certifications that prepare students for both college and high-demand careers.', 3),
('ican-academies', '0361', ARRAY['Allied Health','Culinary Arts','Cybersecurity','Digital Arts/Imaging & Design','Executive Business Academy','Finance','Fire Academy','Game Simulation Animation Programming','Hospitality and Tourism','Information Technology']::text[], 'Every student benefits from a rigorous, theme-based curriculum designed to prepare them for college, careers, and civic life, built on hands-on learning, real-world experiences, and career-focused pathways.', 4),
('ican-academies', '0171', ARRAY['Arts & Entertainment','Business & Entrepreneurship','Education','Engineering & Computer Science','Health Science','Public Affairs']::text[], 'Each pathway offers opportunities to earn industry-recognized certifications, including ESB, PMI, Yamaha, Fusion 360, Adobe, Microsoft Azure AI Foundations, CDA, SERVSafe, and EKG.', 5),
('ican-academies', '0211', ARRAY['Allied Health','Art 2D/3D','Culinary Arts','Entrepreneurship','Finance','Hospitality and Tourism','Journalism','Law Studies','Maritime Technology','Military Science & Leadership (MCJROTC)','Music Conservatory']::text[], 'Cultivates a growth mindset and a supportive, innovative environment where students are encouraged to take risks, solve problems creatively, and collaborate across disciplines, in classrooms and labs designed to simulate real-world workplaces.', 6),
('montessori-program', '2611', '{}'::text[], NULL, 1),
('montessori-program', '2041', '{}'::text[], NULL, 2),
('montessori-program', '0251', '{}'::text[], NULL, 3),
('montessori-program', '3321', '{}'::text[], NULL, 4),
('performing-visual-arts-program', '0371', '{}'::text[], 'The PVA magnet program at Dillard 6-12 is for students in grades 9 through 12.', 1),
('performing-visual-arts-program', '0701', '{}'::text[], NULL, 2),
('performing-visual-arts-program', '0391', '{}'::text[], NULL, 3),
('performing-visual-arts-program', '0341', '{}'::text[], NULL, 4),
('performing-visual-arts-program', '0521', '{}'::text[], NULL, 5),
('performing-visual-arts-program', '0321', '{}'::text[], NULL, 6),
('medical-health-sciences-program', '1741', '{}'::text[], NULL, 1),
('medical-health-sciences-program', '0861', '{}'::text[], NULL, 2),
('medical-health-sciences-program', '0211', '{}'::text[], NULL, 3),
('medical-health-sciences-program', '0361', '{}'::text[], NULL, 4),
('medical-health-sciences-program', '1071', '{}'::text[], NULL, 5),
('aviation-aerospace-program', '1751', '{}'::text[], NULL, 1),
('marine-science-program', '0881', '{}'::text[], NULL, 1),
('marine-science-program', '0171', '{}'::text[], NULL, 2),
('industrial-biotechnology', '1241', '{}'::text[], NULL, 1),
('engineering-environmental-science', '1871', '{}'::text[], NULL, 1),
('environmental-science-everglades-restoration', '2351', '{}'::text[], NULL, 1),
('engineering', '1871', '{}'::text[], NULL, 1),
('stem-program', '1791', '{}'::text[], NULL, 1),
('stem-program', '0581', '{}'::text[], NULL, 2),
('stem-program', '0481', '{}'::text[], NULL, 3),
('stem-program', '0701', '{}'::text[], NULL, 4),
('stem-program', '2971', '{}'::text[], NULL, 5),
('stem-museum', '0231', '{}'::text[], NULL, 1),
('stem-museum', '0941', '{}'::text[], NULL, 2),
('steam-academy', '3581', '{}'::text[], NULL, 1),
('science-pre-engineering', '0361', '{}'::text[], NULL, 1),
('science-pre-engineering', '0481', '{}'::text[], NULL, 2),
('science-pre-engineering', '0211', '{}'::text[], NULL, 3),
('stem-med', '1391', '{}'::text[], NULL, 1)
ON CONFLICT (program_slug, school_loc) DO NOTHING;

-- Widgets hub registration (same shape as iidl-services-directory). Applied once
-- the embed is live on production, so the hub never lists a widget whose
-- preview 404s. Editor: MagnetProgramsPage via /api/bcps/magnet-programs.
INSERT INTO public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
SELECT 'magnet-program-explorer', 'Magnet Program Explorer',
  'Embeddable guide to BCPS magnet programs: browse by school or by program, with search, level, theme and city filters.',
  '/embeds/magnet-program-explorer.html', 'magnet-program-explorer', 6
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_widgets WHERE slug = 'magnet-program-explorer');
INSERT INTO public.acl_objects (brand, kind, slug, title, visibility)
SELECT 'bcps', 'page', 'magnet-program-explorer', 'Magnet Program Explorer', 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND kind = 'page' AND slug = 'magnet-program-explorer');
