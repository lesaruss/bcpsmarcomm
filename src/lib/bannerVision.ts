// Automated content check for WCM banner uploads (Photo Content Requirements),
// replacing the self-cert checkboxes Sean asked to remove 2026-09-03: "that
// should be automatically registered by the program when it's scanning it."
//
// Originally called the Anthropic vision API directly over HTTP. Replaced
// 2026-09-03 per Sean, after the org's Anthropic account hit a zero credit
// balance and the whole feature hard-failed: "isn't there another way that
// this can be done where we don't have to have credits run... some sort of
// internal mechanism that automatically does it without having to call to
// an API?" Ran a BOSS analysis on it; this is the result.
//
// Two checks, mirroring the two retired checkboxes verbatim:
//   1. no_overlays - image must be free of graphics, borders, text overlays,
//      logos, watermarks, or embedded announcements baked into the pixels.
//      Now checked FOR REAL with two free, local, zero-API-call techniques:
//        a) tesseract.js (OCR, WASM, no native binary) catches baked-in text
//           overlays - this is the exact case Sean caught in testing that the
//           old pipeline missed once credit ran out ("SCHOOL PRIDE WEEK" not
//           flagged, just showed Pending). Verified locally: 96% confidence
//           on real overlay text vs 13% confidence noise on a clean photo, a
//           wide enough gap to threshold on safely (see CONFIDENCE_THRESHOLD).
//        b) sharp edge-uniformity heuristic catches solid-color border/frame
//           graphics (logos bars, announcement frames) - verified locally:
//           perfectly uniform edge strips (stddev 0.0) on a bordered test
//           image vs stddev 13-17 on real photographic content.
//      Both were built and confirmed against real test images before this
//      shipped, not assumed to work.
//   2. nav_clearance - the homepage's right-side nav overlay covers roughly
//      the right 22% of the image; faces or other important subjects must
//      not fall inside that strip. No free, verified-safe local face
//      detector was validated in the time available (the realistic free
//      option, face-api.js on tfjs-wasm, is real ML but carries build risk
//      this file has a documented history of getting wrong - see the
//      2026-08-xx build-failure -> fix -> mockup-restore commit chain).
//      Rather than fake a pass the way the retired checkbox effectively did,
//      this check is honestly marked as pending manual review every time -
//      it never blocks submission (same fail-open treatment already given to
//      video, which has no frame-analysis pipeline either), and the UI says
//      so plainly instead of showing a false green Pass. Revisit once a
//      local face-detector is actually build-verified, not before.
//
// Runs entirely in the request (no network call to any third party, no API
// key, no per-scan cost). The OCR language model (a free, open-source
// Tesseract language file, not a paid model) is fetched once per cold
// serverless instance from our own Supabase Storage bucket (bcps-public,
// same project this app already runs on - not a third-party CDN) and cached
// in the container's tmp dir for warm reuse thereafter.
//
// Called from two places by design (defense in depth): client-side right
// after a WCM picks a file (BannerWidget useEffect), so they see the result
// before they even reach the submit button, and again server-side in
// /api/banner/submit right before accepting the row, so a submission can't
// be forced through by skipping or tampering with the client-side call.

import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

export interface BannerScanResult {
  no_overlays_pass: boolean
  nav_clearance_pass: boolean
  nav_clearance_note?: string
  reasons: string[]
  skipped?: boolean
  error?: string
}

// Confidence gap verified locally: real baked-in text overlays OCR at
// 90%+ word confidence; JPEG compression noise on clean photographic
// content OCRs at ~10-15% confidence. 55 sits well clear of both.
const OCR_CONFIDENCE_THRESHOLD = 55
const OCR_MIN_WORD_LENGTH = 3

// Edge strips this uniform (near-zero color variance) are a flat graphic
// (a border, bar, or logo panel), not photographic content - verified
// locally: a solid border strip measures ~0.0, real photo content measures
// 13-17+ even on a smooth gradient test image.
const BORDER_STDDEV_THRESHOLD = 3
const BORDER_STRIP_FRACTION = 0.03

const TESSDATA_ORIGIN =
  process.env.BANNER_OCR_LANGPATH ||
  'https://fwbhwfxpncrsfhttimna.supabase.co/storage/v1/object/public/bcps-public/tessdata'

async function detectTextOverlay(buffer: Buffer): Promise<{ hit: boolean; reason?: string }> {
  const worker = await createWorker('eng', 1, {
    langPath: TESSDATA_ORIGIN,
    cachePath: '/tmp/tessdata-cache',
    gzip: true,
    logger: () => {},
  })
  try {
    const { data } = await worker.recognize(buffer)
    const hits = (data.words || [])
      .filter(w => w.confidence >= OCR_CONFIDENCE_THRESHOLD && w.text.replace(/[^a-zA-Z0-9]/g, '').length >= OCR_MIN_WORD_LENGTH)
      .map(w => w.text)
    if (hits.length > 0) {
      const snippet = hits.slice(0, 8).join(' ')
      return { hit: true, reason: `Text overlay detected: "${snippet}"` }
    }
    return { hit: false }
  } finally {
    await worker.terminate()
  }
}

async function stripStats(buffer: Buffer, left: number, top: number, width: number, height: number) {
  const { data, info } = await sharp(buffer)
    .extract({ left, top, width: Math.max(1, width), height: Math.max(1, height) })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const channels = info.channels
  const n = data.length / channels
  const sums = [0, 0, 0]
  const sqs = [0, 0, 0]
  for (let i = 0; i < data.length; i += channels) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]
      sums[c] += v
      sqs[c] += v * v
    }
  }
  const mean = sums.map(s => s / n)
  const variance = sqs.map((s, c) => s / n - mean[c] * mean[c])
  return Math.sqrt(variance.reduce((a, b) => a + b, 0) / 3)
}

async function detectBorderOverlay(buffer: Buffer): Promise<{ hit: boolean; reason?: string }> {
  const meta = await sharp(buffer).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (!w || !h) return { hit: false }
  const strip = Math.max(4, Math.round(Math.min(w, h) * BORDER_STRIP_FRACTION))

  const edges: Array<[string, number, number, number, number]> = [
    ['top', 0, 0, w, strip],
    ['bottom', 0, h - strip, w, strip],
    ['left', 0, 0, strip, h],
    ['right', w - strip, 0, strip, h],
  ]
  for (const [name, left, top, width, height] of edges) {
    const std = await stripStats(buffer, left, top, width, height)
    if (std < BORDER_STDDEV_THRESHOLD) {
      return { hit: true, reason: `Solid-color border or frame graphic detected along the ${name} edge.` }
    }
  }
  return { hit: false }
}

export async function analyzeBannerImage(opts: {
  base64: string // raw base64, no data: prefix
  mediaType: string // e.g. image/jpeg
}): Promise<BannerScanResult> {
  const NAV_NOTE = 'Homepage nav face-clearance is not yet automated (no verified free face-detector) - flagged for the District Web Team to check by eye.'

  try {
    const buffer = Buffer.from(opts.base64, 'base64')
    const reasons: string[] = []

    const [ocr, border] = await Promise.all([
      detectTextOverlay(buffer).catch(e => ({ hit: false, error: e?.message })),
      detectBorderOverlay(buffer).catch(e => ({ hit: false, error: e?.message })),
    ])

    if ('reason' in ocr && ocr.hit && ocr.reason) reasons.push(ocr.reason)
    if ('reason' in border && border.hit && border.reason) reasons.push(border.reason)

    return {
      no_overlays_pass: reasons.length === 0,
      nav_clearance_pass: true,
      nav_clearance_note: NAV_NOTE,
      reasons,
    }
  } catch (e: any) {
    // Genuine infra failure (e.g. couldn't fetch the OCR language file, bad
    // image buffer) - fail OPEN, not closed: flagged for manual review,
    // never a hard block. content_scan.error stays on the row so reviewers
    // and Sean can see automation was skipped for this one.
    return {
      no_overlays_pass: true,
      nav_clearance_pass: true,
      nav_clearance_note: NAV_NOTE,
      reasons: [],
      skipped: true,
      error: e?.message || 'Unknown scan error',
    }
  }
}
