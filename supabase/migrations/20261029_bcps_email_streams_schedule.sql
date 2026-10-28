-- Recurring emails schedule (Campaigns Phase 2, V 2026-10-28), applied live.
-- Friday 13:31 UTC (9:31 AM Eastern in daylight time, 8:31 in standard):
-- the superadmins are told next week's emails are ready to approve by 5 PM.
-- Weekdays at 12:05 and 13:05 UTC: the send run, which sends only at 8 AM
-- Eastern (whichever of the two that is) and only for an approved week; the
-- cron skips the call entirely when nothing is approved for this week.
select cron.schedule('bcps-email-streams-notify', '31 13 * * 5', $c$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/email-streams/run',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{"mode":"notify"}'::jsonb,
    timeout_milliseconds := 120000
  );
$c$);
select cron.schedule('bcps-email-streams-send', '5 12,13 * * 1-5', $c$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/email-streams/run',
    headers := jsonb_build_object('content-type', 'application/json', 'x-audit-key', (select value from public.lesaruss_secrets where key = 'BCPS_AUDIT_WORKER_KEY')),
    body := '{"mode":"send"}'::jsonb,
    timeout_milliseconds := 300000
  )
  where exists (select 1 from public.bcps_email_approvals where status = 'approved' and week_start = date_trunc('week', (now() at time zone 'America/New_York'))::date);
$c$);
