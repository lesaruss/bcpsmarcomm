-- Full-site audit (Sean, 2026-10-07): a department's site is its main page
-- plus every sub-page in its left menu. Each page gets its own audit row; a
-- run_id ties one pass over a site together. Schools use the same tables
-- (ADA-only for now). Applied via the Supabase MCP on 2026-10-07.

CREATE TABLE IF NOT EXISTS public.bcps_site_pages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   uuid REFERENCES public.bcps_departments(id) ON DELETE CASCADE,
  school_id       uuid REFERENCES public.bcps_schools(id) ON DELETE CASCADE,
  url             text NOT NULL,
  title           text,
  is_main         boolean NOT NULL DEFAULT false,
  source          text NOT NULL DEFAULT 'left_nav' CHECK (source IN ('main','left_nav','manual')),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((department_id IS NULL) <> (school_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS bcps_site_pages_owner_url ON public.bcps_site_pages (coalesce(department_id, school_id), url);
ALTER TABLE public.bcps_site_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY bcps_site_pages_read ON public.bcps_site_pages FOR SELECT TO authenticated USING (true);
COMMENT ON TABLE public.bcps_site_pages IS 'Pages that make up a department (or school) site for the audit: the main page plus sub-pages found in its left menu. active=false drops a page from audits.';

ALTER TABLE public.bcps_audit_results
  ADD COLUMN IF NOT EXISTS site_page_id uuid REFERENCES public.bcps_site_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_id uuid;
CREATE INDEX IF NOT EXISTS bcps_audit_results_run_id ON public.bcps_audit_results (run_id);
COMMENT ON COLUMN public.bcps_audit_results.run_id IS 'One pass over a site: every page audited in that pass shares it. Null for single-page runs before 2026-10-07.';

-- Queue: a 'site' job finds the pages and queues one 'page' job each.
ALTER TABLE public.bcps_audit_queue DROP CONSTRAINT IF EXISTS bcps_audit_queue_department_id_run_month_key;
ALTER TABLE public.bcps_audit_queue ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE public.bcps_audit_queue
  ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.bcps_schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS site_page_id uuid REFERENCES public.bcps_site_pages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS run_id uuid,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'site' CHECK (kind IN ('site','page')),
  ADD COLUMN IF NOT EXISTS requested_by text;
CREATE UNIQUE INDEX IF NOT EXISTS bcps_audit_queue_monthly_site ON public.bcps_audit_queue (coalesce(department_id, school_id), run_month) WHERE kind = 'site' AND requested_by IS NULL;

CREATE OR REPLACE FUNCTION public.bcps_enqueue_monthly_audits() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO bcps_audit_queue (department_id, run_month, kind)
    SELECT id, date_trunc('month', now())::date, 'site' FROM bcps_departments
    WHERE website_url ILIKE 'https://www.browardschools.com/%'
    ON CONFLICT (coalesce(department_id, school_id), run_month) WHERE kind = 'site' AND requested_by IS NULL DO NOTHING
    RETURNING 1
  ) SELECT count(*)::int FROM ins;
$$;
REVOKE ALL ON FUNCTION public.bcps_enqueue_monthly_audits() FROM public, anon, authenticated;
