-- Record of the GTM agency-workspace review step (2026-11-05). Safe to run twice.
insert into public.stream_events (owner, station, summary, keywords, status, context_link)
select 'logan','bcps','bcps-gtm-setup v9 adds a read-only review action: pass/fail on an agency workspace in GTM-NTGC6X38 before the District publishes (tags named "MAGNET |", fired only on /magnet-programs/ pages, existing District tags untouched, workspace up to date, custom code listed to read). Sean: agencies get Edit, the District publishes, access opens and closes on campaign dates. Verified live (live version 5, no agency workspaces yet) and against a mocked failing and passing workspace.',
 array['bcps','gtm','governance','magnet','vendor-access','school-choice'],'completed','https://github.com/lesaruss/bcpsmarcomm/tree/claude/epic-lovelace-bcvdcm'
where not exists (select 1 from public.stream_events where summary like 'bcps-gtm-setup v9 adds a read-only review action%');
