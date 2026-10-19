-- MarComm Assignments fed by Wufoo (Sean, 2026-10-19). New entries on the
-- Wufoo MarComm Request form land in bcps_marcomm_requests as New, with the
-- Wufoo entry number as the job number (the numbering the team already uses:
-- "Wufoo 1744 Atlantic Technical College open house").
--
-- /api/bcps/wufoo-sync does the work with WUFOO_API_KEY (a Vercel env var):
--   discover          lists the account's forms, picks the MarComm Request form,
--                     saves its fields and a guessed field_map here
--   sync              imports entries after last_entry_id, only once enabled
--   register_webhook  asks Wufoo to call the route on every new entry
-- Wufoo's webhook carries HandshakeKey (lesaruss_secrets.BCPS_WUFOO_HANDSHAKE);
-- everything else needs x-sync-key (lesaruss_secrets.BCPS_WUFOO_SYNC_KEY).
-- pg_cron runs sync every 15 minutes as the backstop for a missed webhook.

create table if not exists public.bcps_marcomm_wufoo_state (
  id int primary key default 1 check (id = 1),
  form_hash text,
  form_name text,
  forms jsonb,                -- [{name, hash}] from the last discover
  fields jsonb,               -- the chosen form's fields: [{id, title, type, subfields:[{id, label}]}]
  field_map jsonb,            -- tracker column -> Wufoo field ids, reviewed before enabled
  latest_entries jsonb,       -- [{id, created}] only, to check entry ids match job numbers
  last_entry_id int,
  enabled boolean not null default false,
  webhook_hash text,
  last_run_at timestamptz,
  last_result jsonb,
  last_error text,
  discovered_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.bcps_marcomm_wufoo_state enable row level security;

insert into public.bcps_marcomm_wufoo_state (id, last_entry_id)
values (1, (select max(job_number) from public.bcps_marcomm_requests where source = 'wufoo'))
on conflict (id) do nothing;

-- The Wufoo entry as received, so an import can be checked against the form.
alter table public.bcps_marcomm_requests add column if not exists source_payload jsonb;

insert into public.lesaruss_secrets (key, value, description) values
  ('BCPS_WUFOO_SYNC_KEY', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
   'x-sync-key for bcpsmarcomm /api/bcps/wufoo-sync (pg_cron and manual runs)'),
  ('BCPS_WUFOO_HANDSHAKE', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
   'Handshake key Wufoo sends with its webhook to bcpsmarcomm /api/bcps/wufoo-sync')
on conflict (key) do nothing;

-- Keeps the request form's numbering ahead of imported Wufoo entries.
create or replace function public.bcps_marcomm_bump_job_seq(p_job int)
returns void language sql security definer set search_path = public as $$
  select setval('public.bcps_marcomm_job_seq', greatest(p_job, (select last_value from public.bcps_marcomm_job_seq)))
$$;
revoke all on function public.bcps_marcomm_bump_job_seq(int) from public, anon, authenticated;
grant execute on function public.bcps_marcomm_bump_job_seq(int) to service_role;

select cron.schedule('bcps-marcomm-wufoo-sync', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://bcpsmarcomm.com/api/bcps/wufoo-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-sync-key', (select value from public.lesaruss_secrets where key = 'BCPS_WUFOO_SYNC_KEY')),
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
