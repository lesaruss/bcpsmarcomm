-- Daily digest of waiting audit questions (Sean, 2026-10-08). Weekdays at
-- 12:52 UTC (8:52 ET in daylight time, 7:52 ET in standard time). Fires
-- only when a question is waiting, so quiet days send nothing. The route
-- emails every BCPS admin and superadmin.
select cron.schedule(
  'bcps-audit-questions-digest',
  '52 12 * * 1-5',
  $$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/audit-questions/digest',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (select 1 from public.bcps_audit_questions where status = 'open');
  $$
);
