-- Applied to Supabase project fwbhwfxpncrsfhttimna on 2026-10-29 through the one-time
-- function ve-once-font-open-sans (canon ops-supabase-write-once-function), now a 410 stub.
-- Results: 122 rows backed up (79 briefings, 42 mock_pages, 1 template); 79 briefings,
-- 42 mock_pages and the BCPS document template switched; canon-bcps-doc-template-standard
-- to v3; brand_context bcps fonts.web added. Every changed document differs from its
-- backup only by the font swap (checked: 0 unexpected diffs of 79).
--
-- Web font switch to Open Sans across BCPS documents (Sean, 2026-10-29).
-- Every step is safe to run twice. Run order: backup, briefings, mock_pages,
-- template, canon, brand.

-- backup
create table if not exists public.font_switch_backup_20261029 (
  src text not null, row_id text not null, content text not null,
  backed_up_at timestamptz not null default now(), primary key (src, row_id));
insert into public.font_switch_backup_20261029 (src, row_id, content)
select 'briefings', id::text, content from public.briefings where brand_slug = 'bcps' and content ilike '%Montserrat%'
on conflict do nothing;
insert into public.font_switch_backup_20261029 (src, row_id, content)
select 'mock_pages', id::text, content from public.mock_pages where brand = 'bcps' and content ilike '%Montserrat%'
on conflict do nothing;
insert into public.font_switch_backup_20261029 (src, row_id, content)
select 'templates', id::text, parameters::text from public.templates where id = 'f7037d82-c5e2-4997-8631-aa68993157a4'
on conflict do nothing;

-- briefings
update public.briefings set content = replace(regexp_replace(content,
  'https://fonts\.googleapis\.com/css2\?family=Montserrat:wght@[0-9;]+', 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800', 'g'),
  'Montserrat', 'Open Sans')
where brand_slug = 'bcps' and content ilike '%Montserrat%';

-- mock_pages
update public.mock_pages set content = replace(regexp_replace(content,
  'https://fonts\.googleapis\.com/css2\?family=Montserrat:wght@[0-9;]+', 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800', 'g'),
  'Montserrat', 'Open Sans')
where brand = 'bcps' and content ilike '%Montserrat%';

-- template
update public.templates set parameters = replace(regexp_replace(parameters::text,
  'https://fonts\.googleapis\.com/css2\?family=Montserrat:wght@[0-9;]+', 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800', 'g'),
  'Montserrat', 'Open Sans')::jsonb, updated_at = now()
where id = 'f7037d82-c5e2-4997-8631-aa68993157a4' and parameters::text ilike '%Montserrat%';

-- canon
update public.knowledge_records set
  body = jsonb_set(body, '{rule}', (body->'rule') || to_jsonb('TYPE (amended 2026-10-29, Sean): every BCPS web surface on bcpsmarcomm.com, documents included, is set in Open Sans, the browardschools.com theme font (themes/default_25), loaded from Google Fonts at weights 400 to 800, with Arial as the fallback. Embeds load it themselves because a framed page cannot use the host page''s fonts, and form controls inherit it. This matches the Parents & Families portal page Farrah approved. Arial, Century Gothic and Verdana are BCPS''s approved fonts for print and digital publications; the Communications Standard & Guidelines (rev. April 2025, p.27) exempts websites. Emails stay in Arial. Montserrat, used until 2026-10-29, is retired.'::text))
         || jsonb_build_object('amended_2026_10_29', 'Font changed from Montserrat to Open Sans across documents, the document template, app screens and Finalsite embeds, so embeds flow into browardschools.com (Sean: "everything should apply... aligned with the district standards").'),
  version = version + 1, change_summary = 'Type: Open Sans (District website font) replaces Montserrat on every BCPS web surface. Sean sign-off 2026-10-29.',
  updated_by = 'logan', updated_at = now()
where slug = 'canon-bcps-doc-template-standard' and not (body ? 'amended_2026_10_29');

-- brand
update public.brand_context set
  brand_tokens = jsonb_set(brand_tokens, '{fonts,web}', jsonb_build_object(
    'font', 'Open Sans', 'fallback', 'Arial, Helvetica, sans-serif', 'weights', '400-800',
    'source', 'browardschools.com theme default_25 (main.css), checked 2026-10-29',
    'applies_to', 'bcpsmarcomm.com pages, BCPS documents and Finalsite embeds. Emails stay Arial.',
    'decided', 'Sean, 2026-10-29')),
  updated_at = now()
where brand_slug = 'bcps' and not (brand_tokens->'fonts' ? 'web');
