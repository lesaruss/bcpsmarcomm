-- Magnet Program Explorer demo additions (Sean, 2026-10-29, for the Oct 30
-- meeting with Allan Llanos): school logos, upcoming events with a countdown,
-- and a School Choice window that switches the School Choice banner on and off
-- by date. Same model as the 2026-10-27 tables: public read, writes through the
-- service role only (the editor API). Applied through ve-once-bcps-magnet-demo
-- (registry SUPABASE-MCP-APPROVAL-HOLD-USE-ONCE-FUNCTION).

ALTER TABLE public.bcps_magnet_schools ADD COLUMN IF NOT EXISTS logo_url text;

CREATE TABLE IF NOT EXISTS public.bcps_magnet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT true,
  location text,
  url text,
  description text,
  school_loc text REFERENCES public.bcps_magnet_schools(loc_nbr) ON UPDATE CASCADE ON DELETE SET NULL,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bcps_magnet_events_starts_idx ON public.bcps_magnet_events (starts_at);

-- One row per setting. 'school_choice': { opens, closes (YYYY-MM-DD, Eastern),
-- apply_url, message }. The banner shows only between opens and closes.
CREATE TABLE IF NOT EXISTS public.bcps_magnet_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bcps_magnet_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcps_magnet_settings ENABLE ROW LEVEL SECURITY;

DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bcps_magnet_events', 'bcps_magnet_settings'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'public read ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', 'public read ' || t, t);
    END IF;
  END LOOP;
END $p$;

REVOKE ALL ON public.bcps_magnet_events, public.bcps_magnet_settings FROM anon, authenticated;
GRANT SELECT ON public.bcps_magnet_events, public.bcps_magnet_settings TO anon, authenticated;

-- Seed. The Showcase date is from Allan Llanos at the Oct 27 Hot Lab; time and
-- place are still to confirm, so it is an all-day event with no location.
INSERT INTO public.bcps_magnet_settings (key, value)
SELECT 'school_choice', jsonb_build_object('opens', null, 'closes', null,
  'apply_url', 'https://www.browardschools.com/bcps-departments/academics/magnet-programs/how-to-apply',
  'message', 'School Choice applications are open.')
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_magnet_settings WHERE key = 'school_choice');

INSERT INTO public.bcps_magnet_events (title, starts_at, all_day, featured, description)
SELECT 'BCPS Showcase', '2026-12-01 00:00:00-05', true, true,
  'See what Broward County Public Schools has to offer, including our magnet and innovative programs.'
WHERE NOT EXISTS (SELECT 1 FROM public.bcps_magnet_events WHERE title = 'BCPS Showcase');
