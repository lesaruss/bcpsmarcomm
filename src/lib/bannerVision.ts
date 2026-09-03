// Automated content check for WCM banner uploads (Photo Content Requirements),
// replacing the self-cert checkboxes Sean asked to remove 2026-09-03: "that
// should be automatically registered by the program when it's scanning it."
//
// Uses Claude's vision API directly over HTTP (mirrors the no-SDK pattern in
// lib/resend.ts - no new npm dependency, nothing to install/build-verify).
// Two checks, mirroring the two retired checkboxes verbatim:
//   1. no_overlays - image must be free of graphics, borders, text overlays,
//      logos, watermarks, or embedded announcements baked into the pixels.
//   2. nav_clearance - the homepage's right-side nav overlay covers roughly
//      the right 22% of the image (see BannerWidget's live preview); faces or
//      other important subjects must not fall inside that strip.
// Video is not analyzed here (no frame-extraction pipeline yet) - treated as
// passing, same exemption already used for the 2000x800 dimension check.
//
// Called from two places by design (defense in depth): client-side right
// after a WCM picks a file (BannerWidget useEffect), so they see the result
// before they even reach the submit button, and again server-side in
// /api/banner/submit right before accepting the row, so a submission can't
// be forced through by skipping or tampering with the client-side call.

export interface BannerScanResult {
  no_overlays_pass: boolean
  nav_clearance_pass: boolean
  reasons: string[]
  skipped?: boolean
  error?: string
}

const MODEL = 'claude-sonnet-4-5-20250929'

const SCAN_TOOL = {
  name: 'report_banner_scan',
  description: 'Report the two content-requirement checks for a BCPS homepage banner image.',
  input_schema: {
    type: 'object' as const,
    properties: {
      no_overlays_pass: {
        type: 'boolean',
        description: 'True only if the image itself contains NO graphics, borders, text overlays, logos, watermarks, or embedded announcements baked into the pixels. Photographic content only.',
      },
      nav_clearance_pass: {
        type: 'boolean',
        description: 'True only if no face or other important subject falls within the right-most 22% vertical strip of the image (that strip is covered by the site nav on the live page).',
      },
      reasons: {
        type: 'array',
        items: { type: 'string' },
        description: 'One short, specific reason per failed check (empty array if both pass). E.g. "Text overlay reading SCHOOL PRIDE WEEK in the lower third" or "A student\'s face sits inside the right 22% nav strip."',
      },
    },
    required: ['no_overlays_pass', 'nav_clearance_pass', 'reasons'],
  },
}

export async function analyzeBannerImage(opts: {
  base64: string // raw base64, no data: prefix
  mediaType: string // e.g. image/jpeg
}): Promise<BannerScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { no_overlays_pass: false, nav_clearance_pass: false, reasons: [], error: 'ANTHROPIC_API_KEY not configured' }
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        tools: [SCAN_TOOL],
        tool_choice: { type: 'tool', name: 'report_banner_scan' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: opts.mediaType, data: opts.base64 },
              },
              {
                type: 'text',
                text: 'This image will be used as a BCPS school homepage banner. Run the two content requirement checks and call report_banner_scan with your findings.',
              },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { no_overlays_pass: false, nav_clearance_pass: false, reasons: [], error: `Anthropic ${res.status}: ${text.slice(0, 300)}` }
    }

    const data = await res.json()
    const toolUse = (data.content || []).find((b: any) => b.type === 'tool_use' && b.name === 'report_banner_scan')
    if (!toolUse) {
      return { no_overlays_pass: false, nav_clearance_pass: false, reasons: [], error: 'Model did not return a scan result' }
    }

    const input = toolUse.input || {}
    return {
      no_overlays_pass: !!input.no_overlays_pass,
      nav_clearance_pass: !!input.nav_clearance_pass,
      reasons: Array.isArray(input.reasons) ? input.reasons.slice(0, 6) : [],
    }
  } catch (e: any) {
    return { no_overlays_pass: false, nav_clearance_pass: false, reasons: [], error: e?.message || 'Unknown scan error' }
  }
}
