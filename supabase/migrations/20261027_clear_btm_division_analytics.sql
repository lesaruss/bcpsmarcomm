-- Behavioral Threat Management's analytics rows measured the whole Safety,
-- Security & Emergency Preparedness division (its address was the division
-- homepage until 2026-10-27). Its own page had no recorded traffic, so the
-- sync never replaced them. Cleared at Sean's instruction, Oct 27 Hot Lab;
-- run through a one-time function (ops-supabase-write-once-function).
delete from public.bcps_department_analytics
where department_id = '17e92a60-f000-4933-bb9d-efb0154a9bee' and synced_at < '2026-10-27';
