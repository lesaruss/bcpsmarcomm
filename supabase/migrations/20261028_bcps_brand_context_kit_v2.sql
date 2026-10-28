-- bcps-brand-kit v2 (2026-10-28): brand_context bcps gets the rebuilt kit facts.
-- Applied through the one-time function ve-once-bcps-brand-kit-v2 (canon ops-supabase-write-once-function).
-- Guarded, so running it again changes nothing.
update public.brand_context set
  brand_guide_url = 'https://github.com/lesaruss/lesaruss-context/tree/main/skills/bcps-brand-kit/skills/bcps-brand-kit',
  brand_tokens = brand_tokens
    || jsonb_build_object('fonts', jsonb_build_object(
         'source','Guidelines for Communications and Design, rev. April 2025, p.27',
         'approved', jsonb_build_array('Arial','Century Gothic','Verdana'),
         'max_per_piece', 2,
         'scope','Print and digital communications. Per the guide heading, does NOT apply to District and school websites.'))
    || jsonb_build_object('colors', (brand_tokens->'colors')
         || jsonb_build_object(
           'source','Guidelines for Communications and Design, rev. April 2025, pp.16-26; Color Palette Specifications 12-21',
           'department_secondary', jsonb_build_array('#99CC00','#008B8B','#C8E1F4','#F4D883','#F4C436','#682D87','#D7D8D6','#6A6A6A'),
           'school_palette_note','ada_secondary_hexes is the School palette (schools only). Offices, divisions and departments use department_secondary.',
           'hyperlink', jsonb_build_object('hex','#002EAD','approved_backgrounds', jsonb_build_array('#FFFFFF','#D7D8D6','#F4C436','#C8E1F4')),
           'contrast_rule','WCAG 2.1 A/AA, 4.5:1 minimum for all colors, no large-text exception. Per-color ratios: colors.md in the skill.')),
  notes = notes || E'\n\n2026-10-28 (Logan): bcps-brand-kit v2 rebuilt. v1 shipped without its references/ files. Source now in lesaruss/lesaruss-context skills/bcps-brand-kit (PR 3), re-verified from SharePoint: Communications Standard & Guidelines 4-9-25 ADA final.pdf (supersedes 1-6-22 logo standards and Quick Reference v3), logo section 6-5-24, color palettes 12-21. Corrections: approved fonts exclude websites; Department vs School secondary palettes; hyperlink #002EAD; external logo use needs Chief of Staff approval; do not fake the reverse logo with CSS filters. Old brand_guide_url (hq.lesaruss.ai/briefs/bcps-brand-kit.html) returned 410 and was replaced.',
  updated_at = now()
where brand_slug = 'bcps' and notes not like '%bcps-brand-kit v2 rebuilt%';
