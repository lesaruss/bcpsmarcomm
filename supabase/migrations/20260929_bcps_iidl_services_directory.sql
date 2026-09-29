-- II&DL Services Directory widget (Sean, 2026-09-29). Mirrors the Charter School
-- Directory model: public read-only embed at /embeds/iidl-services-directory.html,
-- edits through /api/bcps/iidl-services (service role, ACL-gated). Seeded from
-- IIDL_Services_Spreadsheet_Rev9_22_2026.xlsx. review_note carries internal flags for
-- II&DL and is NOT readable by anon (column-level grants below).
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-09-29. The
-- Widgets hub registration block at the bottom is applied once the embed and editor
-- are live on production, so the hub never lists a widget whose preview 404s.

CREATE TABLE IF NOT EXISTS public.bcps_iidl_units (
  slug text PRIMARY KEY,
  name text NOT NULL,
  summary text,
  page_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bcps_iidl_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit_slug text REFERENCES public.bcps_iidl_units(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  description text,
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  booking_url text,
  booking_note text,
  review_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bcps_iidl_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_iidl_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read iidl units" ON public.bcps_iidl_units;
CREATE POLICY "public read iidl units" ON public.bcps_iidl_units FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read iidl services" ON public.bcps_iidl_services;
CREATE POLICY "public read iidl services" ON public.bcps_iidl_services FOR SELECT TO anon, authenticated USING (true);

-- Writes go through the service role only. The public may read every column the
-- embed renders, but not review_note.
REVOKE ALL ON public.bcps_iidl_units, public.bcps_iidl_services FROM anon, authenticated;
GRANT SELECT ON public.bcps_iidl_units TO anon, authenticated;
GRANT SELECT (id, name, unit_slug, description, contact_name, contact_title, contact_email, contact_phone, booking_url, booking_note, sort_order)
  ON public.bcps_iidl_services TO anon, authenticated;

INSERT INTO public.bcps_iidl_units (slug, name, summary, page_url, sort_order) VALUES
('distance-learning', 'Distance Learning', 'Expands learning opportunities by connecting students and educators with experts, resources, and experiences beyond the classroom.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/distance-learning', 1),
('instructional-digital-materials', 'Instructional & Digital Materials', 'Provides district-approved print and digital materials that help educators deliver the curriculum and support student learning.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/new-instructional-digital-materials', 2),
('instructional-technology', 'Instructional Technology', 'Helps educators use technology with purpose to strengthen instruction, personalize learning, and engage students.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/instructional-technology', 3),
('library-media-services', 'Library Media Services', 'Promotes reading, digital literacy, responsible technology use, creativity, and access to high-quality library resources.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/library-media-services', 4),
('professional-learning', 'Professional Learning', 'Supports educators and leaders through professional learning, coaching, mentoring, endorsement pathways, and certification resources.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/professional-development-standards-and-support', 5),
('stem-computer-science', 'STEM, Computer Science & Environmental Programs', 'Prepares students for future learning and careers through STEM, computer science, artificial intelligence, esports, environmental programs, and hands-on experiences.', 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/stem-and-computer-science-programs', 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.bcps_iidl_services (name, unit_slug, description, contact_name, contact_title, contact_email, contact_phone, booking_url, booking_note, review_note, sort_order)
SELECT * FROM (VALUES
('Adobe Express & Prisms VR', 'instructional-technology', 'Creative and immersive learning platforms that enable educators and students to create presentations, graphics, videos, digital stories, multimedia learning products, and virtual reality experiences.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Adobe Express and need assistance.', NULL, 1),
('AI Literacy & STEM Challenges', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 2),
('BCPS EcoGuide', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 3),
('Beanstack', 'library-media-services', 'Supports reading progress tracking, engaging challenges, achievement badges, and classroom library success.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'Beanstack Support covers generating challenges, generating reports, and analytics for Media Specialists or other Instructional personnel assigned as the Beanstack administrator.', NULL, 4),
('Bookelicious', 'library-media-services', 'Helps students discover books through personalized recommendations, curated collections, and interactive features.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 5),
('#BrowardCODES & Computer Initiatives', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 6),
('Broward Virtual University (BVU)', 'professional-learning', 'Online courses that support endorsements, certification needs, stronger instructional practice, and continued professional growth.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 7),
('Canvas Learning Management System (LMS)', 'instructional-technology', 'The district learning management system for organizing courses, sharing resources, communicating with students, and supporting digital instruction both in and beyond the classroom.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Canvas or any of the integrations and need assistance.', NULL, 8),
('Certification Renewal Support', 'professional-learning', 'Clear guidance and learning resources that help educators understand and meet certification renewal requirements.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 9),
('Classroom-to-World Connections', 'distance-learning', 'Learning opportunities that transform the classroom into a gateway for exploration, collaboration, and global engagement.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10),
('Classwize Integration Support', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Classwize and need integration assistance. For technical issues, please reach out to the IT Help Desk.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 11),
('Climate Summit & P3 Eco-Challenge', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 12),
('Coaching & Mentoring Resources', 'professional-learning', 'Coaching, mentoring, and job-embedded support that strengthen instructional practice, leadership, collaboration, and continuous improvement.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 13),
('Competitions & Partnerships', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 14),
('Curriculum Implementation Tools', 'instructional-digital-materials', 'Planning tools and instructional supports that help educators use adopted materials effectively and confidently.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 15),
('Destiny', 'library-media-services', 'Provides access to the district’s print and digital library catalog through a user friendly library management platform.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'Destiny support covers all aspects of Destiny for Media Specialists, teachers, and Media Clerks.', NULL, 16),
('Destiny Resource Manager (DRM)', 'library-media-services', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'Destiny Resource Manager (DRM) Support can answer questions regarding adding assets to the DRM platform and barcoding.', 'Unit was blank in the spreadsheet. Proposed unit: Library Media Services. Confirm with II&DL.', 17),
('Digital Instructional Content', 'instructional-digital-materials', 'Carefully selected online content that complements the curriculum and helps educators create engaging learning experiences.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 18),
('Discovery Education', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Discovery Education and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 19),
('Distance Learning', 'distance-learning', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Distance Learning and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Distance Learning. Confirm with II&DL.', 20),
('District-Approved Resources', 'instructional-digital-materials', 'Reviewed resources and digital content that align with district expectations and support classroom instruction.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 21),
('Educational Partnerships', 'distance-learning', 'Collaborations with educational organizations that provide meaningful virtual learning experiences and resources.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 22),
('Endorsement Programs', 'professional-learning', 'Structured learning pathways that help eligible educators earn approved add-on endorsements and deepen specialized knowledge.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 23),
('Esports & Computational Thinking', 'stem-computer-science', NULL, 'Lisa Milenkovic', 'Supervisor, STEM+C, AI, & Immersive Learning', 'lisa.milenkovic@browardschools.com', '754-321-2620', NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 24),
('Expert Connections', 'distance-learning', 'Virtual sessions that bring authors, scientists, industry professionals, and subject matter experts directly into classrooms.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 25),
('Gale', 'library-media-services', 'Offers extensive research databases, reliable academic content, and instructional resources for students and educators.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 26),
('Global Learning Opportunities', 'distance-learning', 'Experiences that expose students to diverse perspectives, cultures, and real-world learning beyond their local community.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 27),
('Instructional Technology Facilitators (ITFs)', 'instructional-technology', 'Provide coaching, modeling, and professional learning, and implementation support to help educators effectively integrate technology into teaching and learning.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This service is for teachers who need support from the Instructional Technology Facilitator assigned to your school. When selecting the staff, be sure to select the ITF you have been working with this year.', NULL, 28),
('Interactive Videoconferencing', 'distance-learning', 'Live virtual connections that extend beyond the classroom and support authentic learning experiences.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', NULL, 'Booking note described Interactive Whiteboard software support, which does not match this service, so it is hidden. Original: "Interactive Whiteboard/Software Support covers the tools in ActivInspire or Class Flow (Promethean), Xpress (Recordex). Questions concerning the hardware should be directed to the IT department."', 29),
('Khan Academy & Khanmigo', 'instructional-technology', 'Instructional resources and AI-powered supports that provide personalized learning opportunities, practice activities, tutoring assistance, skills development, and academic enrichment for students.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 30),
('Learning Across Broward (LAB)', 'professional-learning', 'The district system staff use to find professional learning opportunities, register for courses, and access related support.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 31),
('Library Programming Support', 'library-media-services', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'Library Program support covers building the library collection, acquisition, budgeting, ordering, Inquiry-Based Lesson Design, access and layout, collaboration with colleagues, etc. for Media Specialists and Media clerks.', 'Unit was blank in the spreadsheet. Proposed unit: Library Media Services. Confirm with II&DL.', 32),
('M365 Learning Accelerators Support', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Microsoft Learning Accelerators such as Reading Progress and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 33),
('M365 Productivity Applications Support', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Word, PowerPoint, Class Notebook, Excel, or any other applications found in the Office 365 Suite and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 34),
('MagicSchool AI', 'instructional-technology', 'Artificial intelligence tool that support lesson planning, differentiation, assessment creation, communication, instructional resource development, productivity, accessibility, and student-centered learning experiences.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding MagicSchool and need assistance.', NULL, 35),
('Material Adoption Information', 'instructional-digital-materials', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Spreadsheet description was the Canvas LMS text copied onto this row, so it is hidden. Original: "Online spaces that help educators organize lessons, share content, communicate with students, and deliver engaging and blended learning experiences." Real description needed from II&DL.', 36),
('Microsoft 365, Copilot & Learning Accelerators', 'instructional-technology', 'Productivity, collaboration, and personalized learning tools that support communication, content creation, feedback, and student engagement.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 37),
('PebbleGo Next', 'library-media-services', 'Provides an interactive, student-friendly research database with engaging informational content for grades 3-5.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 38),
('Poly Studio Video Bar Support', 'distance-learning', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers who have questions regarding Poly Studio Video Bar and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Distance Learning. Confirm with II&DL.', 39),
('Professional Learning Calendars', 'professional-learning', 'Easy-to-use calendars that help staff find upcoming professional learning sessions and district training opportunities.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 40),
('Sora', 'library-media-services', 'Provides convenient access to eBooks and audiobooks through a user-friendly platform with online and offline reading options.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 41),
('Substitute Support', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This service is for Substitutes who need support from an Instructional Technology Facilitator.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 42),
('Supplemental Resources', 'instructional-digital-materials', 'Additional print and digital materials that reinforce core instruction, provide meaningful practice, and extend student learning.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 43),
('Textbooks & eTextbooks', 'instructional-digital-materials', 'District-approved print and digital materials that support standards-aligned instruction and consistent access to core content.', NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'Book time with the Textbook Coordinator.', 'Booking note was "Textbook Coordinator Support". Expanded to a sentence; confirm wording with II&DL.', 44),
('VILS Support', 'instructional-technology', NULL, NULL, NULL, NULL, NULL, 'https://bookings.cloud.microsoft/book/InnovativeLearningDepartment@browardcountyschools.onmicrosoft.com/?ismsaljsauthenabled', 'This is an open session for teachers from VILS schools who have questions and need assistance.', 'Unit was blank in the spreadsheet. Proposed unit: Instructional Technology. Confirm with II&DL.', 45),
('Virtual Field Trips', 'distance-learning', 'Interactive learning experiences that connect students with experts and educational specialists from around the world through videoconferencing.', NULL, NULL, 'DistanceLearning@browardschools.com', NULL, NULL, NULL, NULL, 46)
) AS v(name, unit_slug, description, contact_name, contact_title, contact_email, contact_phone, booking_url, booking_note, review_note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_iidl_services);

-- Widgets hub registration + page object for the edit ACL (same shape as
-- charter-school-directory).
INSERT INTO public.bcps_widgets (slug, title, description, preview_path, editor_component, sort_order)
SELECT 'iidl-services-directory', 'II&DL Services Directory',
  'Embeddable directory of Instructional Innovation & Digital Learning services, with booking links and unit filters.',
  '/embeds/iidl-services-directory.html', 'iidl-services-directory', 3
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_widgets WHERE slug = 'iidl-services-directory');
INSERT INTO public.acl_objects (brand, kind, slug, title, visibility)
SELECT 'bcps', 'page', 'iidl-services-directory', 'II&DL Services Directory', 'restricted'
WHERE NOT EXISTS (SELECT 1 FROM public.acl_objects WHERE brand = 'bcps' AND kind = 'page' AND slug = 'iidl-services-directory');
