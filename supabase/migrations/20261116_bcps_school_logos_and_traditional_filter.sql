-- School Financial Reports, round 2 (Vanessa, 2026-11-16): traditional district
-- schools only, and each school's logo beside its name.
--
-- Traditional = the location number is in bcps_school_directory. That leaves 224
-- schools (every one has both 2023-24 and 2024-25). The 15 locations left out are
-- programs and contracted sites, not charter schools (no charter school is in these
-- reports): 0007 Acceleration Academies, 0100 Hospital Homebound, 5501 ARC Broward,
-- 5511 Ann Storck, 5521 Baudhuin, 5531/5541 Broward Children's Center N/S, 5561 UCP,
-- 5581 Alphabet Land, 6011 Detention Center, 6017 Youth Treatment Center, 6091 PACE,
-- 7001/7004 Broward Virtual, 9998 Home Education. Their rows stay; the embed reads
-- is_traditional = true, and the editor can flip the flag.
--
-- bcps_school_logos: one logo per location, reusable by other widgets. Filled from
-- each school's Finalsite homepage (the "Logo Image" element, fsThumbnailLogo),
-- fetched with pg_net from bcps_schools.site_url (217 of 224). 6501 Henry D. Perry
-- comes from perryeducation.browardschools.com (filed under 0592 in bcps_schools).
-- Left blank (embed shows initials): 1282 Nova Blanche Forman (its site shows Nova
-- Eisenhower's logo), 0551 Plantation Middle (site did not respond), and the
-- repurposed campuses 1171 Sunshine, 1191 North Fork, 0601 Seagull, 3571 Panther
-- Run, 3311 Palm Cove (their sites now show the district placeholder).

CREATE TABLE IF NOT EXISTS public.bcps_school_logos (
  loc_no text PRIMARY KEY,
  logo_url text,
  source_url text,
  fetch_request_id bigint,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bcps_school_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read school logos" ON public.bcps_school_logos FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.bcps_school_logos FROM anon, authenticated;
GRANT SELECT (loc_no, logo_url) ON public.bcps_school_logos TO anon, authenticated;

ALTER TABLE public.bcps_school_financial_reports ADD COLUMN IF NOT EXISTS is_traditional boolean NOT NULL DEFAULT true;
GRANT SELECT (is_traditional) ON public.bcps_school_financial_reports TO anon, authenticated;

UPDATE public.bcps_school_financial_reports f SET is_traditional = false, updated_at = now()
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_school_directory d WHERE d.loc_no = f.location_number);

-- Logo fill (run once; pg_net is asynchronous, so step 2 runs after the responses land):
-- 1) INSERT INTO public.bcps_school_logos (loc_no, source_url, fetch_request_id)
--    SELECT t.loc, s.site_url, net.http_get(s.site_url, timeout_milliseconds := 30000) FROM <traditional locs> t JOIN bcps_schools s ...
-- 2) UPDATE public.bcps_school_logos l SET logo_url = substring(<fsThumbnailLogo block> from 'url%22:%22(https://resources\.finalsite\.net/images/[^%"]+)%22')
--    FROM net._http_response h WHERE h.id = l.fetch_request_id;
