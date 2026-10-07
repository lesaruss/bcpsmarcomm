-- Department audit, monthly run (Sean, 2026-10-07). pg_cron queues every
-- department on the 1st; a worker tick every 4 minutes asks
-- bcpsmarcomm.com/api/bcps/audit-worker to audit the next one, so
-- browardschools.com sees one page every few minutes (it rate-limits bursts).
-- Applied via the Supabase MCP on 2026-10-07.

CREATE TABLE IF NOT EXISTS public.bcps_audit_queue (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   uuid NOT NULL REFERENCES public.bcps_departments(id) ON DELETE CASCADE,
  run_month       date NOT NULL,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','skipped')),
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text,
  audit_result_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  UNIQUE (department_id, run_month)
);
ALTER TABLE public.bcps_audit_queue ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.bcps_audit_queue IS 'Monthly department audit queue. Filled by bcps_enqueue_monthly_audits(), drained one job per worker call by bcps_claim_audit_job(). Service role only.';

-- Queue every department with a browardschools.com page for this month.
CREATE OR REPLACE FUNCTION public.bcps_enqueue_monthly_audits() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH ins AS (
    INSERT INTO bcps_audit_queue (department_id, run_month)
    SELECT id, date_trunc('month', now())::date FROM bcps_departments
    WHERE website_url ILIKE 'https://www.browardschools.com/%'
    ON CONFLICT (department_id, run_month) DO NOTHING
    RETURNING 1
  ) SELECT count(*)::int FROM ins;
$$;

-- Hand out the next job. A job stuck 'running' for 10 minutes is retried;
-- after 3 attempts it is marked failed.
CREATE OR REPLACE FUNCTION public.bcps_claim_audit_job() RETURNS SETOF public.bcps_audit_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE bcps_audit_queue SET status = 'failed', finished_at = now(), last_error = coalesce(last_error, 'timed out 3 times')
  WHERE status = 'running' AND started_at < now() - interval '10 minutes' AND attempts >= 3;
  RETURN QUERY
  UPDATE bcps_audit_queue q SET status = 'running', started_at = now(), attempts = q.attempts + 1
  WHERE q.id = (
    SELECT id FROM bcps_audit_queue
    WHERE status = 'queued' OR (status = 'running' AND started_at < now() - interval '10 minutes' AND attempts < 3)
    ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
  ) RETURNING q.*;
END $$;

REVOKE ALL ON FUNCTION public.bcps_enqueue_monthly_audits() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.bcps_claim_audit_job() FROM public, anon, authenticated;

-- Shared key the worker checks; generated once, never leaves the database
-- except in the cron call's header.
INSERT INTO public.lesaruss_secrets (key, value, description, updated_at)
VALUES ('BCPS_AUDIT_WORKER_KEY', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'Header key pg_cron sends to bcpsmarcomm.com /api/bcps/audit-worker', now())
ON CONFLICT (key) DO NOTHING;

-- 1st of the month, 6:05 AM Eastern (10:05 UTC): queue every department.
SELECT cron.schedule('bcps-audit-enqueue-monthly', '5 10 1 * *', $$ select public.bcps_enqueue_monthly_audits(); $$);
-- Every 4 minutes, only while jobs wait: ask the worker for one audit.
SELECT cron.schedule('bcps-audit-worker-tick', '*/4 * * * *', $$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/audit-worker',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{}'::jsonb,
    timeout_milliseconds := 240000
  )
  where exists (select 1 from public.bcps_audit_queue where status = 'queued' or (status = 'running' and started_at < now() - interval '10 minutes'));
$$);
