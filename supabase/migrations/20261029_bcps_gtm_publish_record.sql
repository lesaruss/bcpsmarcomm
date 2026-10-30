-- Record of the GTM-NTGC6X38 publish (2026-10-29). Applied through the
-- one-time function ve-once-gtm-log (canon ops-supabase-write-once-function)
-- after execute_sql held the write. Both statements are safe to run twice.
update public.error_registry set resolved = true, resolved_by = 'logan', updated_at = now(),
 fix_steps = fix_steps || '["RESOLVED 2026-10-29: District-owned container GTM-NTGC6X38 (bcps.pio@gmail.com, added by Finalsite in Composer Domain Settings > SEO > Google Tag Manager ID) published as version 5 by bcps-gtm-setup. Sends Finalsite document-library clicks as file_download (link_url, link_text) and Finalsite video plays as video_start/progress/complete to G-EW5DDY3E0Z (property 527326342) through an explicit Google tag with send_page_view false. Verified on the live Referendum 2026 page with blocked hits: page_view unchanged at 1 per load, all events landing in G-EW5DDY3E0Z. Counting starts 2026-10-29; nothing before can be recovered from 527326342. Open: the G-B601R4LMEG property (holds Finalsite historical one-pager and video events) is not visible to bcps.pio; ask Finalsite who owns it."]'::jsonb
where error_code = 'GA4-FINALSITE-RESOURCE-MANAGER-NO-DOWNLOAD-EVENT' and resolved is not true;

insert into public.stream_events (owner, station, summary, keywords, status, context_link)
select 'logan','bcps','GTM-NTGC6X38 (District-owned, bcps.pio) published v5 and verified live: Finalsite document-library downloads and Finalsite video plays now reach GA4 property 527326342 (G-EW5DDY3E0Z), no page-view doubling. Referendum one-pager, toolkit and promo video tracked from 2026-10-29. Found 3 GA4 IDs on browardschools.com; G-B601R4LMEG property not visible to bcps.pio.',
 array['bcps','gtm','ga4','referendum','downloads','video','governance'],'completed','https://github.com/lesaruss/bcpsmarcomm/tree/claude/optimistic-tesla-shts97'
where not exists (select 1 from public.stream_events where summary like 'GTM-NTGC6X38 (District-owned, bcps.pio) published v5%');
