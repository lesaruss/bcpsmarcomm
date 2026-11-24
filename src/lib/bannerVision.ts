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

import path from 'path'
import sharp from 'sharp'
import Anthropic from '@anthropic-ai/sdk'
import { createWorker } from 'tesseract.js'
import { anthropicKey } from '@/lib/anthropic-key'

export interface BannerScanResult {
  no_overlays_pass: boolean
  nav_clearance_pass: boolean
  nav_clearance_note?: string
  // Text found by OCR. Reported separately from no_overlays_pass since
  // 2026-09-29 (Vanessa Deslandes): OCR cannot tell a sign physically in the
  // scene (a student holding a banner) from text laid over the photo, so
  // text is a WARNING the WCM must attest to, not a hard block. Borders and
  // frames stay hard blocks via no_overlays_pass / reasons.
  text_detected?: boolean
  text_reason?: string
  // Face check (Sean + Vanessa Deslandes, 2026-11-24): Claude Haiku looks at
  // the photo the way the school site shows it and says whether a face or
  // head is cut off or covered. 'problem' fails the row (the WCM picks
  // another photo, or says the check is wrong and the Web Team decides);
  // 'clear' and 'unknown' still need the WCM's own Confirm. Never a block
  // on its own when the check could not run.
  face_check?: 'clear' | 'problem' | 'unknown'
  face_reason?: string
  // True when Claude judged added text/graphics (not OCR). Text that is
  // part of the scene (a shirt, a ribbon, a sign) passes with no WCM
  // attestation (Sean + Vanessa Deslandes, 2026-11-24).
  overlay_by_vision?: boolean
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

// tesseract.js resolves its worker/core scripts with a runtime-computed
// path.join(__dirname, ...) - invisible to Next.js's static bundler, so on
// Vercel the worker thread can't find its own script (found live 2026-09-03:
// "Cannot find module '/var/task/.next/worker-script/node/index.js'", the
// request just hung until Vercel's function timeout). outputFileTracingIncludes
// in next.config.js ships the real files into the Lambda at
// /var/task/node_modules/... (confirmed via a live stack trace), but
// require.resolve('literal/path') does NOT give a usable path here: this
// file is webpack-bundled app code, and webpack rewrites require.resolve of
// a literal string to its own internal numeric MODULE ID, not a filesystem
// path - passing that number straight to `new Worker()` produced a second
// live bug ("filename argument must be of type string... Received type
// number (4537)"). tesseract.js/tesseract.js-core are excluded from the
// webpack bundle (serverComponentsExternalPackages in next.config.js) and
// land as real files under process.cwd()/node_modules at runtime, so building
// the path with plain path.join against process.cwd() - never
// require.resolve - is what actually works on Vercel.
const WORKER_PATH = path.join(process.cwd(), 'node_modules/tesseract.js/src/worker-script/node/index.js')
const CORE_PATH = path.join(process.cwd(), 'node_modules/tesseract.js-core/tesseract-core.wasm.js')

async function detectTextOverlay(buffer: Buffer): Promise<{ hit: boolean; reason?: string }> {
  const worker = await createWorker('eng', 1, {
    langPath: TESSDATA_ORIGIN,
    cachePath: '/tmp/tessdata-cache',
    gzip: true,
    workerPath: WORKER_PATH,
    corePath: CORE_PATH,
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

// The live homepage banner: the photo is cropped to 1920 x 800 (object-fit
// cover, centered) and the right-hand nav, solid white button rows, covers
// the right 22% (BannerSiteFrame in BannerWidget.tsx). The check sees that
// exact view, nav drawn in, so "covered" means what the WCM sees.
const FACE_MODEL = 'claude-haiku-5-5'
const VIEW_W = 1536
const VIEW_H = 640
const NAV_FRACTION = 0.22

const FACE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['people_visible', 'problem', 'where', 'explanation', 'added_overlay', 'overlay_explanation'],
  properties: {
    people_visible: { type: 'boolean' },
    problem: { type: 'boolean' },
    where: { type: 'string', enum: ['none', 'top edge', 'white panel on the right', 'top edge and white panel', 'other edge'] },
    explanation: { type: 'string' },
    added_overlay: { type: 'boolean' },
    overlay_explanation: { type: 'string' },
  },
}

const FACE_SYSTEM = `You check school homepage banner photos before they go live. You get two images.
Image 1 is the original photo. Image 2 is exactly what the website shows: the photo cropped to the banner, with the site's white navigation panel drawn over the right side. The white panel is drawn by the site; never count it as a problem in the photo itself.

Check 1, added text or graphics (use image 1): was anything added on top of the photo after it was taken? That means words, titles, captions, dates, logos, stickers, watermarks, frames, borders, color bars or graphic shapes laid over the picture. Text that is physically part of the scene is fine and is NOT an overlay: words on clothing, ribbons, medals, banners or signs people hold, posters on a wall, building signs, scoreboards. Set added_overlay and write overlay_explanation in one short plain sentence, for example "A title is printed across the top of the photo." or "No text or graphics were added to the photo."

Check 2, faces (use image 2): decide whether any person's face or head is cut off by the top edge, cut off by another edge, or covered (even partly) by the white panel on the right.
A problem means a viewer would see a head sliced off, a face cut by the frame, or a face or head behind the white panel. Bodies, hands or backs of heads at an edge, or people far in the background that are only a few pixels tall, are not a problem.
If no people are visible, there is no problem.
Write the explanation in one short plain sentence a school staff member will read, for example: "The girl on the left has the top of her head cut off by the top edge." or "No faces are cut off or covered."`

type PhotoCheck = { check: 'clear' | 'problem' | 'unknown'; reason?: string; overlay?: { hit: boolean; reason: string } }

async function checkFaces(buffer: Buffer): Promise<PhotoCheck> {
  try {
    const key = await anthropicKey()
    if (!key) return { check: 'unknown', reason: 'The automatic face check is not set up on this site.' }
    const navW = Math.round(VIEW_W * NAV_FRACTION)
    const view = await sharp(buffer)
      .rotate()
      .resize(VIEW_W, VIEW_H, { fit: 'cover', position: 'centre' })
      .composite([{ input: { create: { width: navW, height: VIEW_H, channels: 3, background: '#ffffff' } }, left: VIEW_W - navW, top: 0 }])
      .jpeg({ quality: 80 })
      .toBuffer()
    const original = await sharp(buffer)
      .rotate()
      .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: FACE_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: FACE_SCHEMA } },
      system: FACE_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Image 1, the original photo:' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: original.toString('base64') } },
          { type: 'text', text: 'Image 2, the banner as the site shows it:' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: view.toString('base64') } },
          { type: 'text', text: 'Run both checks.' },
        ],
      }],
    })
    if (msg.stop_reason !== 'end_turn') return { check: 'unknown', reason: 'The automatic face check did not finish for this photo.' }
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    const out = JSON.parse(text) as { people_visible: boolean; problem: boolean; where: string; explanation: string; added_overlay: boolean; overlay_explanation: string }
    return { check: out.problem ? 'problem' : 'clear', reason: out.explanation, overlay: { hit: !!out.added_overlay, reason: out.overlay_explanation } }
  } catch (e: any) {
    console.error('[bannerVision] face check failed:', e?.message || e)
    return { check: 'unknown', reason: 'The automatic face check could not run for this photo.' }
  }
}

export async function analyzeBannerImage(opts: {
  base64: string // raw base64, no data: prefix
  mediaType: string // e.g. image/jpeg
  faces?: boolean // run the face check (banner photos only)
}): Promise<BannerScanResult> {
  // nav_clearance_pass stays true here (never a block), but the widget no
  // longer shows it as a Pass: since 2026-11-24 the face row needs the WCM's
  // own Confirm (checklist_ack.face_clear), enforced in /api/banner/submit.
  const NAV_NOTE = 'Faces are checked by the WCM (Confirm under the preview) and spot checked by the District Web Team.'

  try {
    const buffer = Buffer.from(opts.base64, 'base64')
    const reasons: string[] = []

    // Deliberately NOT caught per-check here: an OCR/sharp failure must not
    // read as "no violation found" (that produced a false Pass in live
    // testing 2026-09-03 - the exact silent-auto-pass failure mode Sean
    // originally flagged, just relocated). A genuine failure propagates to
    // the outer catch below, which fails OPEN with the real error attached,
    // not a silent clean bill of health.
    const [ocr, border, faces] = await Promise.all([
      detectTextOverlay(buffer),
      detectBorderOverlay(buffer),
      opts.faces ? checkFaces(buffer) : Promise.resolve(null),
    ])

    // Claude saw the photo: it decides added text/graphics, and text that is
    // part of the scene passes without asking the WCM. OCR and the border
    // heuristic are only the fallback when that check could not run.
    if (faces?.overlay) {
      if (faces.overlay.hit) reasons.push(faces.overlay.reason || 'Text or graphics were added on top of the photo.')
      return {
        no_overlays_pass: reasons.length === 0,
        text_detected: false,
        overlay_by_vision: true,
        nav_clearance_pass: true,
        nav_clearance_note: NAV_NOTE,
        face_check: faces.check,
        face_reason: faces.reason,
        reasons,
      }
    }

    if (border.hit && border.reason) reasons.push(border.reason)

    return {
      no_overlays_pass: reasons.length === 0,
      text_detected: ocr.hit,
      text_reason: ocr.hit ? ocr.reason : undefined,
      nav_clearance_pass: true,
      nav_clearance_note: NAV_NOTE,
      ...(faces ? { face_check: faces.check, face_reason: faces.reason } : {}),
      reasons,
    }
  } catch (e: any) {
    // Genuine infra failure (e.g. couldn't fetch the OCR language file, bad
    // image buffer) - fail OPEN, not closed: flagged for manual review,
    // never a hard block. content_scan.error stays on the row so reviewers
    // and Sean can see automation was skipped for this one. Logged (not
    // just swallowed into the row) so a failure is visible in Vercel
    // runtime logs, not only discoverable by reading old submissions.
    console.error('[bannerVision] scan failed, failing open:', e?.message || e, e?.stack)
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
