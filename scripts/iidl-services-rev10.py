"""Builds supabase/migrations/20261020_bcps_iidl_services_rev10.sql from
IIDL_Dept_Services_SpreadsheetRev10_9_2026.xlsx (Alex Macri, II&DL, 2026-10-09).

Usage: python3 -I scripts/iidl-services-rev10.py <path-to-xlsx> > supabase/migrations/20261020_bcps_iidl_services_rev10.sql

Every cleanup the sheet needed is an explicit entry in OVERRIDES / DROP below,
so the diff between the sheet and the widget is reviewable in one place.
"""
import re
import sys

import openpyxl

UNIT_SLUGS = {
    'Artificial Intelligence & Digital Citizenship': 'ai-digital-citizenship',
    'Distance Learning': 'distance-learning',
    'Instructional & Digital Materials': 'instructional-digital-materials',
    'Instructional Technology': 'instructional-technology',
    'Library Media Services': 'library-media-services',
    'Professional Learning': 'professional-learning',
    'STEM, Computer Science & Environmental Programs': 'stem-computer-science',
}

# Audience Focus column: 'School', 'All', 'Parents', and the long Professional
# Learning sentence ("All district staff, all eligible educators, ...").
def audience(v):
    v = (v or '').strip().lower()
    if v == 'school': return 'school'
    if v == 'parents': return 'family'
    if v.startswith('all'): return 'all'
    return None

# Sheet rows dropped from the widget.
DROP = {
    37: 'Second "Inservice Credit & Transcript Support" row (only lab@ and an alternate brief description); merged into row 36.',
    54: 'Empty row with only a stray Bookings URL.',
}

# Per-row fixes, keyed by sheet row. 'desc_from_brief' uses the Brief
# Description column when Services Description is blank, a copy of the
# booking note, or weaker than the brief.
OVERRIDES = {
    7: {'booking_note': None, 'review_note': 'Rev10 booking note describes Interactive Whiteboard support (ActivInspire, ClassFlow, Xpress), not videoconferencing, so it is hidden. Correct booking note needed from II&DL.'},
    11: {'desc_from_brief': True},
    13: {'description': None, 'review_note': 'Rev10 Services Description is the Canvas LMS text copied onto this row ("Online spaces that help educators organize lessons..."), so it is hidden. Real description needed from II&DL.'},
    16: {'contact_title': None},  # title repeated the name ("BCPS Canvas Admin")
    17: {'desc_from_brief': True},  # Services Description repeated the booking note
    20: {'desc_from_brief': True},
    22: {'review_note': 'Looks like an older version of "M365 Productivity Applications Support" (same topic, no contact or booking). Confirm with II&DL whether both should stay.'},
    23: {'booking_note': None},  # identical to the description
    30: {'desc_from_brief': True},
    32: {'name': 'AI Learning Pathways (Coming Soon)'},
    33: {'description': 'Provides a central location for practical guidance, strategies, and implementation resources for using BCPS-approved AI tools, with role-specific resources for instructional staff, school leaders, district administrators, and AI Liaisons. Access it through Clever, the Resources and Help menu in Canvas, or the enrollment link: https://browardschools.instructure.com/enroll/3LJAXT'},
    36: {'description': 'Assistance with missing or incorrect inservice credit, transcript discrepancies, and questions about recorded professional learning completions.'},
    39: {'desc_from_brief': True},
    41: {'desc_from_brief': True},
    43: {'name': '3D Printing, Spatial Reasoning & Design Thinking', 'contact_title': 'Supervisor, STEM+C, AI, & Immersive Learning'},
    44: {'service_url': 'https://www.browardschools.com/bcps-departments/academics/instructional-innovation-digital-learning/stem-and-computer-science-programs/environmental-stewardship/bcps-ecoguide'},
    48: {'name': 'Mixed & Virtual Reality (AR/VR/XR, PrismsVR, ReframeXR)'},
    49: {'name': 'Partnerships with the STEM Community'},
    52: {'name': 'STEM Challenges & Competitions'},
}


def clean(v):
    if v is None: return None
    v = re.sub(r'\s*\n\s*', ', ', str(v)).strip()
    return None if v in ('', '-') else v


def emails(v):
    v = clean(v)
    if not v: return None
    parts = [p.strip().lower() for p in re.split(r'[;,]|\band\b', v) if p.strip()]
    return '; '.join(parts)


def sql(v):
    if v is None: return 'NULL'
    if isinstance(v, int): return str(v)
    return "'" + v.replace("'", "''") + "'"


def main(path):
    ws = openpyxl.load_workbook(path).active
    unit_summaries, unit_pages, rows = {}, {}, []
    for r in range(2, ws.max_row + 1):
        if r in DROP: continue
        c = [ws.cell(r, i).value for i in range(1, 15)]
        if not clean(c[0]): continue
        unit_name = clean(c[2])
        slug = UNIT_SLUGS[unit_name]
        o = OVERRIDES.get(r, {})
        brief, full = clean(c[1]), clean(c[4])
        booking = clean(c[11])
        row = {
            'name': clean(c[0]),
            'unit_slug': slug,
            'description': brief if o.get('desc_from_brief') or not full else full,
            'contact_name': clean(c[5]),
            'contact_title': clean(c[6]),
            'contact_email': emails(c[7]),
            'contact_phone': clean(c[8]),
            'contact_address': clean(c[10]),
            # Professional Learning put lab@ in the Bookings column; it is
            # already the contact email, and only URLs make a Book button.
            'booking_url': booking if booking and booking.startswith('http') else None,
            'booking_note': clean(c[12]),
            'audience': audience(c[13]),
            'service_url': None,
            'review_note': None,
        }
        if not row['booking_url']: row['booking_note'] = None
        for k, v in o.items():
            if k != 'desc_from_brief': row[k] = v
        rows.append(row)
        # A unit's summary is the Brief Description the sheet repeats on most
        # of its rows; one-off briefs are service text, not the unit's.
        unit_summaries.setdefault(slug, {}).setdefault(brief, 0)
        unit_summaries[slug][brief] += 1
        page = clean(c[3])
        if page and page.startswith('http') and slug not in unit_pages and r not in (44,):
            unit_pages[slug] = page

    rows.sort(key=lambda s: re.sub(r'^[^0-9a-z]+', '', s['name'].lower()))
    cols = ['name', 'unit_slug', 'description', 'contact_name', 'contact_title', 'contact_email', 'contact_phone',
            'contact_address', 'booking_url', 'booking_note', 'audience', 'service_url', 'review_note', 'sort_order']
    out = []
    for i, s in enumerate(rows, 1):
        s['sort_order'] = i
        out.append('(' + ', '.join(sql(s[k]) for k in cols) + ')')

    print(HEADER)
    print("INSERT INTO public.bcps_iidl_units (slug, name, summary, page_url, sort_order) VALUES ('ai-digital-citizenship', 'Artificial Intelligence & Digital Citizenship', NULL, NULL, 1) ON CONFLICT (slug) DO NOTHING;")
    print()
    print('-- Rev10 replaces every service row (no hub edits had been made since the 2026-09-29 seed).')
    print('DELETE FROM public.bcps_iidl_services;')
    print()
    print('INSERT INTO public.bcps_iidl_services (' + ', '.join(cols) + ') VALUES')
    print(',\n'.join(out) + ';')
    print(f'\n-- {len(rows)} services. Dropped sheet rows: ' + '; '.join(f'{k}: {v}' for k, v in DROP.items()))
    for slug, counts in unit_summaries.items():
        top, n = max(counts.items(), key=lambda kv: kv[1])
        print(f'-- unit {slug}: most-repeated brief ({n}x) = {top!r}; page = {unit_pages.get(slug)}', file=sys.stderr)


HEADER = """-- II&DL Services Directory, Rev10 refresh (Sean, 2026-10-20). Source:
-- IIDL_Dept_Services_SpreadsheetRev10_9_2026.xlsx from Alex Macri (II&DL),
-- generated by scripts/iidl-services-rev10.py, which holds every cleanup made
-- to the sheet. Rev10 adds a new unit (Artificial Intelligence & Digital
-- Citizenship), a Contact Address column, an Audience Focus column, and one
-- service-specific page (BCPS EcoGuide). The Contact Department Title column is
-- the same department on every row, so it is not stored.
-- Applied to project fwbhwfxpncrsfhttimna one statement per execute_sql call
-- (error_registry SUPABASE-MCP-EXECUTE-SQL-TIMEOUT-ON-HTML-LITERALS).

ALTER TABLE public.bcps_iidl_services ADD COLUMN IF NOT EXISTS contact_address text;
-- school (school-based staff), family, or all. NULL means not stated.
ALTER TABLE public.bcps_iidl_services ADD COLUMN IF NOT EXISTS audience text CHECK (audience IN ('school', 'family', 'district', 'all'));
-- A page for this service itself; the card links it instead of the unit page.
ALTER TABLE public.bcps_iidl_services ADD COLUMN IF NOT EXISTS service_url text;
GRANT SELECT (contact_address, audience, service_url) ON public.bcps_iidl_services TO anon, authenticated;

-- Units stay A to Z, so the new unit goes first.
UPDATE public.bcps_iidl_units SET sort_order = CASE slug
  WHEN 'distance-learning' THEN 2 WHEN 'instructional-digital-materials' THEN 3
  WHEN 'instructional-technology' THEN 4 WHEN 'library-media-services' THEN 5
  WHEN 'professional-learning' THEN 6 WHEN 'stem-computer-science' THEN 7 ELSE sort_order END;
"""

if __name__ == '__main__':
    main(sys.argv[1])
