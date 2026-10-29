-- The audit worker tick no longer holds a pg_net slot while audits run
-- (Sean, 2026-10-29). /api/bcps/audit-worker now answers at once and finishes
-- its jobs in the background (waitUntil), so the tick only needs to wait a few
-- seconds. Before this, each tick waited up to 240 s and stalled every other
-- pg_net call, the email jobs included (registry
-- PGNET-LONG-REQUEST-HOLDS-QUEUE). Apply after that route is live.
select cron.schedule(
  'bcps-audit-worker-tick',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/audit-worker',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (select 1 from public.bcps_audit_queue where status = 'queued' or (status = 'running' and started_at < now() - interval '10 minutes'));
  $$
);
