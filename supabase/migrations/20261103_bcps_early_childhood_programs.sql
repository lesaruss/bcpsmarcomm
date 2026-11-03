-- Early Childhood Programs Directory widget (Sean, 2026-11-03, V1 for review).
-- Same model as the II&DL Services Directory and Charter School Directory: a
-- public read-only embed at /embeds/early-childhood-programs.html, writes through
-- the service role only (/api/bcps/early-childhood-programs, ACL-gated).
-- Source of the school list: 2026_2027_VPK_PreK_Head_Start_Schools_Updated_Website.csv
-- from Early Childhood Education (88 schools). Program ages and costs come from
-- that sheet's program legend and from the 2026-11-03 meeting with Lindsey Way and
-- Jennifer Amador: Head Start and Early Head Start are free everywhere, VPK is free
-- for the full day at Title I schools, and at tuition-supported schools VPK covers
-- 3 hours with families paying the rest and 3-year-olds also accepted.
-- review_note is internal and NOT readable by anon (column-level grants below).
-- Policies are created only when missing, never replaced (the connector holds some keywords).
-- The Widgets hub registration is a separate file, applied once the embed is live.

CREATE TABLE IF NOT EXISTS public.bcps_early_childhood_programs (
  slug text PRIMARY KEY,
  name text NOT NULL,
  card_label text NOT NULL,
  cost_label text NOT NULL,
  ages_label text NOT NULL,
  explainer text,
  learn_more_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bcps_early_childhood_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  city text,
  zip text,
  phone text,
  early_head_start boolean NOT NULL DEFAULT false,
  head_start boolean NOT NULL DEFAULT false,
  vpk_free_full_day boolean NOT NULL DEFAULT false,
  vpk_tuition_supported boolean NOT NULL DEFAULT false,
  lat numeric(9,6),
  lng numeric(9,6),
  review_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row (id = 1): the line about how families apply and the department contact.
-- The embed shows the contact button only once an email or link is filled in.
CREATE TABLE IF NOT EXISTS public.bcps_early_childhood_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  apply_note text,
  contact_label text,
  contact_email text,
  contact_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bcps_early_childhood_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_early_childhood_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_early_childhood_settings ENABLE ROW LEVEL SECURITY;

DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bcps_early_childhood_programs', 'bcps_early_childhood_schools', 'bcps_early_childhood_settings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'public read ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', 'public read ' || t, t);
    END IF;
  END LOOP;
END $p$;

REVOKE ALL ON public.bcps_early_childhood_programs, public.bcps_early_childhood_schools, public.bcps_early_childhood_settings FROM anon, authenticated;
GRANT SELECT ON public.bcps_early_childhood_programs, public.bcps_early_childhood_settings TO anon, authenticated;
GRANT SELECT (id, name, address, city, zip, phone, early_head_start, head_start, vpk_free_full_day, vpk_tuition_supported, lat, lng, sort_order)
  ON public.bcps_early_childhood_schools TO anon, authenticated;

INSERT INTO public.bcps_early_childhood_programs (slug, name, card_label, cost_label, ages_label, explainer, learn_more_url, sort_order)
SELECT * FROM (VALUES
('early-head-start', 'Early Head Start', 'Early Head Start', 'Free', 'Expecting mothers to age 2',
 'Free program for pregnant mothers and children age 2 or younger on or before September 1.', NULL, 1),
('head-start', 'Head Start Preschool', 'Head Start Preschool', 'Free', 'Ages 3 to 4',
 'Free preschool for children ages 3 to 4 on or before September 1.', 'https://www.browardschools.com/fs/pages/83036', 2),
('vpk-free-full-day', 'VPK Free Full Day', 'VPK', 'Free full day', 'Age 4',
 'Voluntary Pre-Kindergarten for children who turn 4 on or before September 1. At Title I schools, VPK is free for the full day.', 'https://www.browardschools.com/fs/pages/83018', 3),
('vpk-tuition-supported', 'VPK Tuition-Supported', 'VPK', 'Tuition-supported', 'Ages 3 to 4',
 'State-funded VPK covers 3 hours of the day and families pay the rest. Open to children who turn 4 on or before September 1. Age 3 is also accepted at these schools.', 'https://www.browardschools.com/fs/pages/83018', 4)
) AS v(slug, name, card_label, cost_label, ages_label, explainer, learn_more_url, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_early_childhood_programs);

INSERT INTO public.bcps_early_childhood_settings (id, apply_note, contact_label)
SELECT 1, 'Early Head Start and Head Start families apply through the district''s central application process, not through individual schools.', 'Contact Early Childhood Education'
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_early_childhood_settings);

-- City names normalized from the spreadsheet: "Ft. Lauderdale" is Fort Lauderdale
-- and "No Lauderdale" is North Lauderdale, so the city filter lists each once.
INSERT INTO public.bcps_early_childhood_schools (name, address, city, zip, phone, early_head_start, head_start, vpk_free_full_day, vpk_tuition_supported, review_note, sort_order)
SELECT * FROM (VALUES
('Annabel C. Perry PK-8', '6850 SW 34th Street', 'Miramar', '33023', '754-323-7050', false, false, true, false, NULL, 1),
('Atlantic West Elementary', '301 NW 69th Terrace', 'Margate', '33063', '754-322-5300', false, true, false, false, NULL, 2),
('Bayview Elementary', '1175 Middle River Drive', 'Fort Lauderdale', '33304', '754-322-5400', false, false, false, true, NULL, 3),
('Bethune Elementary', '2400 Meade Street', 'Hollywood', '33020', '754-323-4900', true, true, false, false, NULL, 4),
('Boulevard Heights Elementary', '7201 Johnson Street', 'Hollywood', '33024', '754-323-4950', false, true, false, false, NULL, 5),
('Broward Estates Elementary', '441 NW 35th Ave', 'Fort Lauderdale', '33311', '754-322-5550', true, true, true, false, NULL, 6),
('Browardview Elementary', '1800 SW 62 Avenue', 'Pompano Beach', '33068', '754-322-5500', false, true, false, false, NULL, 7),
('C. Robert Markham Elementary', '1501 NW 15 Avenue', 'Pompano Beach', '33060', '754-322-6950', false, true, true, false, NULL, 8),
('Castle Hill Elementary', '2640 NW 46 Avenue', 'Lauderhill', '33313', '754-322-5600', false, true, false, false, NULL, 9),
('Charles Drew Elementary', '1000 NW 31st Ave', 'Pompano Beach', '33069', '754-322-6250', true, true, false, false, NULL, 10),
('Coconut Palm Elementary', '13601 Monarch Lakes Blvd', 'Miramar', '33027', '754-323-5050', false, false, true, false, NULL, 11),
('Colbert Elementary', '2701 Plunkett Street', 'Hollywood', '33020', '754-323-5100', false, true, false, false, NULL, 12),
('Collins Elementary', '1050 NW 2 Street', 'Dania', '33004', '754-323-5150', false, true, false, false, NULL, 13),
('Coral Glades High', '2700 Sportsplex Drive', 'Coral Springs', '33065', '754-322-1250', false, false, false, true, 'High school location. Confirm with Early Childhood Education that families should see it as a VPK option.', 14),
('Coral Park Elementary', '8401 Westview Drive', 'Coral Springs', '33067', '754-322-5850', false, false, false, true, NULL, 15),
('Coral Springs Elementary', '3601 NW 110 Avenue', 'Coral Springs', '33065', '754-322-5900', false, true, false, false, NULL, 16),
('Cresthaven Elementary', '801 NE 25 Street', 'Pompano Beach', '33064', '754-322-6000', false, true, true, false, NULL, 17),
('Cypress Elementary', '851 SW 3 Avenue', 'Pompano Beach', '33060', '754-322-6050', false, true, false, false, NULL, 18),
('Davie Elementary', '7025 SW 39 Street', 'Davie', '33314', '754-323-5400', false, true, false, false, NULL, 19),
('Deerfield Beach Elementary', '650 NE 1st Street', 'Deerfield Beach', '33441', '754-322-6100', false, false, true, false, NULL, 20),
('Deerfield Park Elementary', '650 SW 3rd Avenue', 'Deerfield Beach', '33441', '754-322-6150', false, true, false, false, NULL, 21),
('Dillard Elementary', '2330 NW 12 Court', 'Fort Lauderdale', '33311', '754-322-6200', false, true, true, false, NULL, 22),
('Dr. Martin Luter King, Jr. Elementary', '591 NW 31 Avenue', 'Fort Lauderdale', '33311', '754-322-6550', false, true, true, false, 'Spreadsheet spelled the name "Luter". Corrected to "Luther". Confirm the school name with Early Childhood Education.', 23),
('Driftwood Elementary', '2700 NW 69 Avenue', 'Hollywood', '33024', '754-323-5450', false, true, false, false, NULL, 24),
('Eagle Point Elementary', '100 Indian Trace', 'Weston', '33326', '754-323-5500', false, false, false, true, NULL, 25),
('Endeavour Primary Learning', '2701 NW 56 Avenue', 'Lauderhill', '33313', '754-321-6600', false, true, false, false, NULL, 26),
('Everglades Elementary', '2900 Bonaventure Boulevard', 'Weston', '33331', '754-323-5600', false, false, false, true, NULL, 27),
('Fairway Elementary', '7850 Fairway Blvd.', 'Miramar', '33023', '754-323-5650', false, true, true, false, NULL, 28),
('Flamingo Elementary', '1130 SW 133 Avenue', 'Davie', '33325', '754-323-5700', false, false, true, false, NULL, 29),
('Floranada Elementary', '5251 NE 14 Way', 'Fort Lauderdale', '33334', '754-322-6350', false, false, false, true, NULL, 30),
('Forest Hills Elementary', '3100 NW 85 Avenue', 'Coral Springs', '33065', '754-322-6400', false, false, true, false, NULL, 31),
('Fox Trail Elementary', '1250 Nob Hill Road', 'Davie', '33324', '754-323-5800', false, false, false, true, NULL, 32),
('Griffin Elementary', '5050 SW 116th Avenue', 'Cooper City', '33330', '754-323-5900', false, false, false, true, NULL, 33),
('Gulfstream Early Learning Center', '120 SW 4th Avenue', 'Hallandale', '33009', '754-323-4700', true, true, true, false, NULL, 34),
('Hawkes Bluff Elementary', '5900 SW 160th Avenue', 'Davie', '33331', '754-323-6100', false, false, false, true, NULL, 35),
('Heron Heights Elementary', '11010 Nob Hill Road', 'Parkland', '33076', '754-322-9150', false, false, false, true, NULL, 36),
('Horizon Elementary', '2101 Pine Island Road NW', 'Sunrise', '33322', '754-322-6450', false, false, true, false, NULL, 37),
('Lake Forest Elementary', '3550 SW 48 Avenue', 'Pembroke Park', '33023', '754-323-6350', false, true, false, false, NULL, 38),
('Lakeside Elementary', '900 NW 136th Avenue', 'Pembroke Pines', '33028', '754-323-6400', false, false, true, false, NULL, 39),
('Larkdale Elementary', '3250 NW 12 Place', 'Fort Lauderdale', '33311', '754-322-6600', false, true, false, false, NULL, 40),
('Lauderhill Paul Turner Elementary', '1500 NW 49 Avenue', 'Lauderhill', '33313', '754-322-6700', false, true, false, false, NULL, 41),
('Liberty Elementary', '2450 Banks Road', 'Margate', '33063', '754-322-6750', false, false, true, false, NULL, 42),
('Lloyd Estates Elementary', '750 NW 41 Street', 'Oakland Park', '33309', '754-322-6800', false, false, true, false, NULL, 43),
('Manatee Bay Elementary', '19200 Manatee Isles Drive', 'Fort Lauderdale', '33332', '754-323-6450', false, false, false, true, NULL, 44),
('Margate Elementary', '6300 NW 18 Street', 'Margate', '33063', '754-322-6900', false, false, true, false, NULL, 45),
('McNab Elementary', '1350 SE 9th Avenue', 'Pompano Beach', '33060', '754-322-7050', false, true, false, false, NULL, 46),
('Miramar Elementary', '6831 SW 26 Street', 'Miramar', '33023', '754-323-6550', false, true, false, false, NULL, 47),
('Morrow Elementary', '408 SW 76 Terrace', 'North Lauderdale', '33068', '754-322-7150', false, true, true, false, NULL, 48),
('Nob Hill Elementary', '2100 NW 104th Avenue', 'Sunrise', '33322', '754-322-7200', false, false, false, true, NULL, 49),
('North Lauderdale Elementary', '7500 Kimberly Blvd.', 'North Lauderdale', '33068', '754-322-7400', false, true, true, false, 'Spreadsheet city read "No Lauderdale". Shown as "North Lauderdale" so the city filter does not split.', 50),
('North Side Elementary', '120 NE 11 Street', 'Fort Lauderdale', '33304', '754-322-7450', false, true, false, false, NULL, 51),
('Oakland Park Elementary', '936 NE 33 Street', 'Oakland Park', '33334', '754-322-7500', false, true, false, false, NULL, 52),
('Oakridge Elementary', '1507 N. 28 Avenue', 'Hollywood', '33020', '754-323-6700', false, false, true, false, NULL, 53),
('Orange Brook Elementary', '715 S. 46 Avenue', 'Hollywood', '33021', '754-323-6750', false, false, true, false, NULL, 54),
('Oriole Elementary', '3081 NW 39 Street', 'Lauderdale Lakes', '33309', '754-322-7550', false, true, true, false, NULL, 55),
('Park Trails Elementary', '10700 Trails End', 'Parkland', '33076', '754-322-7800', false, false, false, true, NULL, 56),
('Pasadena Lakes Elementary', '8801 Pasadena Boulevard', 'Pembroke Pines', '33024', '754-323-6900', false, false, true, false, NULL, 57),
('Pembroke Pines Elementary', '6700 SW 9 Street', 'Pembroke Pines', '33023', '754-323-7000', false, false, true, false, NULL, 58),
('Peters Elementary', '851 NW 68 Avenue', 'Plantation', '33317', '754-322-7900', true, true, false, false, NULL, 59),
('Pines Lakes Elementary', '10300 Johnson Street', 'Pembroke Pines', '33026', '754-323-7100', false, false, true, false, NULL, 60),
('Pinewood Elementary', '1600 SW 83 Avenue', 'North Lauderdale', '33068', '754-322-7950', false, false, true, false, NULL, 61),
('Plantation Elementary', '651 NW 42 Avenue', 'Plantation', '33317', '754-322-8000', false, true, false, false, NULL, 62),
('Pompano Beach Elementary', '700 NE 13 Avenue', 'Pompano Beach', '33060', '754-322-8050', false, true, false, false, NULL, 63),
('Quiet Waters Elementary', '4150 W. Hillsboro Blvd.', 'Deerfield Beach', '33442', '754-322-8100', false, true, false, false, NULL, 64),
('Riverland Elementary', '2600 SW 11 Court', 'Fort Lauderdale', '33312', '754-323-7200', false, true, false, false, NULL, 65),
('Riverside Elementary', '11450 Riverside Drive', 'Coral Springs', '33071', '754-322-8250', false, false, false, true, NULL, 66),
('Rock Island Elementary', '2350 NW 19 Street', 'Oakland Park', '33311', '754-322-8300', false, true, false, false, NULL, 67),
('Royal Palm Elementary', '1951 NW 56 Avenue', 'Lauderhill', '33313', '754-322-8350', false, true, true, false, NULL, 68),
('Sanders Park Elementary', '800 NW 16 Street', 'Pompano Beach', '33060', '754-322-8400', false, true, false, false, NULL, 69),
('Sandpiper Elementary', '3700 Hiatus Road', 'Sunrise', '33351', '754-322-8450', false, false, true, false, NULL, 70),
('Sea Castle Elementary', '9600 Miramar Boulevard', 'Miramar', '33025', '754-323-7250', false, false, true, false, NULL, 71),
('Sheridan Hills Elementary', '5001 Thomas Street', 'Hollywood', '33021', '754-323-7300', false, true, false, false, NULL, 72),
('Silver Palms Elementary', '1209 NW 155 Avenue', 'Pembroke Pines', '33028', '754-323-7450', false, false, false, true, NULL, 73),
('Silver Ridge Elementary', '9100 SW 36th Street', 'Davie', '33328', '754-323-7500', false, false, false, true, NULL, 74),
('Stephen Foster Elementary', '3471 SW 22 Street', 'Fort Lauderdale', '33312', '754-323-5750', false, false, true, false, NULL, 75),
('Stirling Elementary', '5500 Stirling Road', 'Hollywood', '33021', '754-323-7600', false, false, true, false, NULL, 76),
('Sunland Park Academy', '919 NW 13th Avenue', 'Fort Lauderdale', '33311', '754-322-6650', false, true, true, false, NULL, 77),
('Sunset Lakes Elementary', '18400 SW 25 Street', 'Miramar', '33029', '754-323-7650', false, false, false, true, NULL, 78),
('Tamarac Elementary', '7601 University Drive', 'Tamarac', '33321', '754-322-8600', false, true, true, false, NULL, 79),
('Tedder Elementary', '4157 NE 1 Terrace', 'Pompano Beach', '33064', '754-322-8650', false, true, false, false, NULL, 80),
('Thurgood Marshall Elementary', '800 NW 13 Street', 'Fort Lauderdale', '33311', '754-322-7000', true, true, false, false, NULL, 81),
('Village Elementary', '2100 NW 70 Avenue', 'Sunrise', '33313', '754-322-8750', false, true, false, false, NULL, 82),
('Walker Elementary', '1001 NW 4 Street', 'Fort Lauderdale', '33311', '754-322-8800', false, true, false, false, NULL, 83),
('Welleby Elementary', '3230 Nob Hill Road', 'Sunrise', '33351', '754-322-8850', false, false, true, false, NULL, 84),
('West Broward High', '500 NW 209 Avenue', 'Pembroke Pines', '33029', '754-323-2600', false, false, false, true, 'High school location. Confirm with Early Childhood Education that families should see it as a VPK option.', 85),
('West Hollywood Elementary', '6301 Hollywood Blvd.', 'Hollywood', '33024', '754-323-7850', false, true, true, false, NULL, 86),
('Westwood Heights Elementary', '2861 SW 9 Street', 'Fort Lauderdale', '33312', '754-323-7900', false, true, false, false, NULL, 87),
('Winston Park Elementary', '4000 Winston Park Blvd', 'Coconut Creek', '33073', '754-322-9000', false, false, false, true, NULL, 88)
) AS v(name, address, city, zip, phone, early_head_start, head_start, vpk_free_full_day, vpk_tuition_supported, review_note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_early_childhood_schools);
