'use client'

// WCM Banner Submission App widget.
// Built 2026-09-02 for Vanessa Deslandes / District Web Team, replacing the
// Power Apps mockup she originally shared (subscription-gated, not on our
// stack) with a widget on our own bcpsmarcomm.com WCM dashboard - per Sean:
// "The task is to use our own platform to create a tool... this could
// become a widget that we put inside of our BCPS MarCom."
//
// Scope confirmed via Sean + Vanessa Deslandes, 2026-08-24 through
// 2026-09-03: WCMs pick their school (Explicit selector - see
// /api/banner/schools; WCMs can be assigned to more than one school) and
// submit banner photos/videos to a review queue (never auto-published); a
// live preview shows the file composited into the actual banner + right-nav
// display so the WCM can self-check quality and whether the nav blocks
// faces; a 2-item requirement checklist (media release, final acknowledgment
// - see CHECKLIST comment) must be acknowledged before submit, alongside a
// live right-hand Validation checklist status panel (see
// VALIDATION_CHECKLIST comment) mirroring Vanessa's mockup; up to 3
// submissions per request; a separate Request Removal flow lets a WCM ask
// to take down one of their own prior uploads; the District Web Team
// reviews everything (uploads + removals) in an internal queue, approves or
// rejects with a reason, and a rejection fires an automated templated email
// to the WCM. Admin/Manager permissions for this feature are self-contained
// (bcps_banner_admins) - Vanessa is the seeded Admin.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useBCPSShell } from '@/components/BCPSShell'
import { SAMPLE_SUPERADMIN_ID } from '@/components/Sidebar'

type SubmissionType = 'upload' | 'removal'
type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface MySubmission {
  id: string
  type: SubmissionType
  status: SubmissionStatus
  file_name: string | null
  file_type: 'image' | 'video' | null
  banner_title: string | null
  banner_caption: string | null
  alt_text: string | null
  target_submission_id: string | null
  requested_removal_date: string | null
  removal_description: string | null
  rejection_reason: string | null
  submitted_at: string
  reviewed_at: string | null
}

interface ReviewSubmission extends MySubmission {
  wcm_email: string | null
  signed_url: string | null
  download_url: string | null
  school_name: string | null
  posted_at: string | null
  posted_by_email: string | null
  content_scan: { text_detected?: boolean; text_reason?: string } | null
  checklist_ack: { in_scene_text?: boolean } | null
}

interface BannerAdminRow {
  id: string
  user_id: string
  email: string | null
  role: 'admin' | 'manager'
  added_by_email: string | null
  created_at: string
}

const RIGHT_NAV_ITEMS = [
  'Our School', 'Academics', 'Students & Parents', 'Activities & Athletics',
  'School Counseling', 'Contact', 'Schedule a Tour',
]

// Default placeholder shown in the live preview before a WCM has chosen a
// file, so the preview (and its Desktop/Tablet/Mobile width controls) is
// visible and useful from the moment the tab opens - per Sean, 2026-09-03:
// show the composited preview by default with a stand-in image, then swap
// in the real upload the instant one is chosen. Flat icon, neutral gray,
// matches the rest of this widget's UI-chrome palette (no new brand color
// introduced) so it doesn't get mistaken for on-brand content.
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="2880" height="1600" viewBox="0 0 2880 1600">
      <rect width="2880" height="1600" fill="#e4e4e4"/>
      <g transform="translate(1440,720)" fill="none" stroke="#8a8f98" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
        <rect x="-220" y="-150" width="440" height="300" rx="24" fill="#eeeeee"/>
        <circle cx="-110" cy="-70" r="34" fill="#eeeeee"/>
        <path d="M-220 90 L-70 -30 L40 60 L120 -10 L220 90 Z" fill="#eeeeee"/>
      </g>
      <text x="1440" y="1020" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#6b7280" text-anchor="middle">
        Sample banner image
      </text>
      <text x="1440" y="1090" font-family="Arial, sans-serif" font-size="38" fill="#8a8f98" text-anchor="middle">
        Upload your photo or video below to see it here
      </text>
    </svg>
  `)

// Checklist, adapted from Vanessa Deslandes's source Power Apps mockup - it
// originally had 3 grouped sections, 4 manual checkboxes. Restored verbatim
// 2026-09-03 after an earlier pass that night wrongly collapsed these into
// one panel and turned 3 of the 4 into auto-passed non-checkboxes - Sean
// caught it against the actual mockup screenshot.
//
// Then, later the same day, Sean asked for exactly that: the Photo Content
// Requirements pair (no_overlays, nav_visibility) came OUT as self-cert
// checkboxes, replaced by a real automated scan (lib/bannerVision.ts, called
// from the useEffect below and re-checked server-side in
// /api/banner/submit) - not the earlier mistake, because this time there IS
// a real vision-model pass behind it instead of an auto-passed no-op. Only
// media_release and final_ack remain as manual checkboxes; nothing here
// self-certifies content the tool can actually check itself.
const CHECKLIST = [
  {
    key: 'media_release' as const,
    section: 'Approvals & Permissions',
    text: 'I confirm that all students appearing in submitted photos or videos have a signed media release on file.',
  },
  // Sean + Vanessa Deslandes, 2026-10-05: a pilot WCM erased a student's face
  // instead of choosing another photo. Manual attestation for now; an
  // automated image check is planned once API credits are in place.
  {
    key: 'faces_visible' as const,
    section: 'Approvals & Permissions',
    text: 'I confirm that no faces in my photos or videos have been blurred, erased, covered, or edited out. If a student cannot appear, I chose a different photo.',
  },
  {
    key: 'final_ack' as const,
    section: 'Final Acknowledgment',
    text: 'I have reviewed and understand all requirements. I acknowledge that submissions that do not meet these requirements will not be published.',
  },
]

// Validation checklist (right-hand status panel), verbatim labels + order
// from Vanessa's mockup, reordered 2026-09-03 per Sean: whatever the tool
// itself scans/derives goes first ("upfront"), whatever requires the WCM to
// fill something in goes last ("at the bottom"). files/dims/no_overlays/
// nav_clearance are populated the instant a file is chosen (automated);
// title/alt/approvals/final_ack only become true once the WCM types or
// checks something. Submit stays disabled until every row here is true -
// see allValidationPassed below.
const VALIDATION_CHECKLIST = [
  // School is required to submit, so it is a row here too (Vanessa
  // Deslandes, 2026-10-02: every row read Pass while Submit stayed grayed
  // out because no school was picked, and nothing said why).
  { key: 'school', label: 'School selected' },
  { key: 'files', label: 'Up to three files' },
  { key: 'dims', label: 'Media meets 1920 × 800 px minimum requirements' },
  { key: 'no_overlays', label: 'Image is free of graphics, borders, text overlays' },
  { key: 'nav_clearance', label: 'Homepage navigation face-clearance (flagged for manual review)' },
  { key: 'title', label: 'Banner title provided' },
  { key: 'alt', label: 'Required alternative text provided' },
  { key: 'approvals', label: 'Approvals and permissions acknowledged' },
  { key: 'final_ack', label: 'Final acknowledgment completed' },
] as const

// Validation checklist chip states. THREE states, not two: before this the
// chip was a straight pass/pending ternary, so a check that had genuinely
// FAILED (the content scan came back with a real negative verdict, or a
// chosen image is under the pixel minimum) rendered as the same plain gray
// "Pending" chip as a check that simply had not run yet. The only signal of
// a hard failure was the separate red banner under the preview, which is
// easy to miss and does not tell you WHICH row is blocking.
//
// Fail reuses the softer pink/red already in this file for the rejected
// badge and the content-scan banner (#fbe9e7 / #a13a2f), not a hard red,
// per the Vanessa Deslandes walkthrough (2026-09-08): a failed check is
// blocking, but it should not feel punitive - the WCM is being told what to
// re-shoot, not told off. The inset ring separates it from the gray Pending
// chip at a glance without adding a border (no row-height shift).
// 'confirm' (added 2026-09-29): the scan found text, which may be a real sign
// in the scene rather than an overlay - the WCM has to confirm which before
// the row passes. Amber, same palette as the degraded-scan notice.
type ValidationState = 'pass' | 'fail' | 'pending' | 'confirm'

const VALIDATION_CHIP: Record<ValidationState, { bg: string; fg: string; ring: string; label: string }> = {
  pass:    { bg: '#1e6b3a', fg: '#fff',    ring: 'none',                       label: 'Pass' },
  fail:    { bg: '#fbe9e7', fg: '#a13a2f', ring: 'inset 0 0 0 1px #f0c4bd',    label: 'Fail' },
  confirm: { bg: '#fdf3e0', fg: '#8a5a00', ring: 'inset 0 0 0 1px #f0d9a8',    label: 'Confirm' },
  pending: { bg: '#e4e4e4', fg: '#666',    ring: 'none',                       label: 'Pending' },
}

type Tab = 'upload' | 'removal' | 'mine' | 'review' | 'admins' | 'wcms'

// Fixed rejection-reason categories, per the Vanessa Deslandes walkthrough
// (2026-09-08): reject is a category pick, not free text, so every WCM sees
// a consistent reason and Sentinel/analytics can group by cause later.
// "Other" is the only category that takes a free-text comment, and that
// comment is required. Keep this list and REVIEW's server-side validation
// in sync (src/app/api/banner/review/route.ts).
const REJECT_REASON_CATEGORIES = [
  'Wrong photo dimensions or orientation',
  'Image quality too low',
  'Embedded text or logos',
  'Faces blurred, erased, or covered',
  'Other',
] as const

// Character limits (Vanessa Deslandes, 2026-10-02). Kept in sync with
// /api/banner/submit.
// Minimum image size matches Finalsite's homepage hero banner minimum
// (Sean + Vanessa Deslandes, 2026-10-02), lowered from 2000 x 800 so the
// rule is the platform's own published standard.
const MIN_WIDTH = 1920
const MIN_HEIGHT = 800

const TITLE_MAX = 40
const CAPTION_MAX = 115
const MAX_FILES = 3

interface ScanResult {
  no_overlays_pass: boolean
  nav_clearance_pass: boolean
  nav_clearance_note?: string
  text_detected?: boolean
  reasons: string[]
}

// One banner in a New Upload request.
interface BannerItem {
  key: string
  file: File | null
  previewUrl: string | null
  kind: 'image' | 'video' | null
  // Natural pixel size, for the MIN_WIDTH x MIN_HEIGHT minimum row. Images only.
  dims: { width: number; height: number } | null
  scanState: 'idle' | 'scanning' | 'done' | 'degraded' | 'error'
  scanResult: ScanResult | null
  scanError: string | null
  title: string
  caption: string
  alt: string
  // WCM confirms detected text is part of the scene, per banner.
  inSceneText: boolean
  // JPEG EXIF orientation (1-8), null if none. 5-8 means the camera saved
  // the pixels sideways with a "rotate on display" flag.
  orientation: number | null
}

function newBannerItem(): BannerItem {
  return {
    key: Math.random().toString(36).slice(2),
    file: null, previewUrl: null, kind: null, dims: null,
    scanState: 'idle', scanResult: null, scanError: null,
    title: '', caption: '', alt: '', inSceneText: false, orientation: null,
  }
}

// Reads the EXIF orientation tag from a JPEG, or null. Browsers apply this
// flag before measuring (naturalWidth/Height), while Windows' file
// Properties shows the stored size - so a sideways-flagged 2358 x 958 photo
// measures 958 x 2358 here and fails the minimum (Vanessa Deslandes,
// 2026-10-02: "sometimes it passes, sometimes it doesn't" - a copy that went
// through email loses the flag and passes).
async function readJpegOrientation(f: File): Promise<number | null> {
  if (f.type !== 'image/jpeg') return null
  const v = new DataView(await f.slice(0, 256 * 1024).arrayBuffer())
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null
  let off = 2
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off)
    const len = v.getUint16(off + 2)
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      const tiff = off + 10
      if (tiff + 8 > v.byteLength) return null
      const little = v.getUint16(tiff) === 0x4949
      const ifd = tiff + v.getUint32(tiff + 4, little)
      if (ifd + 2 > v.byteLength) return null
      const count = v.getUint16(ifd, little)
      for (let i = 0; i < count; i++) {
        const e = ifd + 2 + i * 12
        if (e + 10 > v.byteLength) return null
        if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little)
      }
      return null
    }
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null
    off += 2 + len
  }
  return null
}

function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length
  return (
    <div style={{ fontSize: 11, marginTop: 3, textAlign: 'right', color: n >= max ? '#a13a2f' : 'var(--text-muted)' }}>
      {n}/{max} characters
    </div>
  )
}

function statusBadge(status: SubmissionStatus) {
  const map: Record<SubmissionStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: '#fdf3e0', fg: '#8a5a00', label: 'Pending' },
    approved: { bg: '#e6f4ea', fg: '#1e6b3a', label: 'Approved' },
    rejected: { bg: '#fbe9e7', fg: '#a13a2f', label: 'Rejected' },
  }
  const s = map[status]
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>
      {s.label}
    </span>
  )
}

// The mocked school-site frame (header, 1920 x 800 homepage banner, right
// nav, title/caption), shared by the WCM's live preview and the Review
// Queue, so reviewers judge a submission in the same frame the WCM saw
// (Vanessa Deslandes + Rudy Carril, 2026-10-05).
function BannerSiteFrame({ url, kind, alt, title, caption, frameRef, resizable = false }: {
  url: string
  kind: 'image' | 'video' | null
  alt: string
  title: string
  caption: string
  frameRef?: React.Ref<HTMLDivElement>
  resizable?: boolean
}) {
  return (
    <>
      <style>{`
        .bwp-frame { container-type: inline-size; container-name: bwp; }
        .bwp-wide-only { display: flex; }
        .bwp-narrow-only { display: none; }
        @container bwp (max-width: 480px) {
          .bwp-wide-only { display: none !important; }
          .bwp-narrow-only { display: block !important; }
        }
      `}</style>

      <div
        ref={frameRef}
        className="bwp-frame"
        style={{
          width: '100%', maxWidth: '100%', minWidth: 260, resize: resizable ? 'horizontal' : 'none', overflow: 'hidden',
          borderRadius: 6, border: '1px solid var(--border)', background: '#fff',
        }}
      >
        {/* Mocked site header - generic placeholder logo/title, not the real
            school's, since one widget serves every BCPS school. */}
        <div className="bwp-wide-only" style={{
          background: '#0a3764', color: '#fff', alignItems: 'center', gap: '3cqw',
          padding: '2.2cqw 3cqw',
        }}>
          <div style={{
            width: '9cqw', height: '9cqw', minWidth: 30, minHeight: 30, maxWidth: 46, maxHeight: 46,
            background: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg viewBox="0 0 24 24" width="65%" height="65%" fill="none" stroke="#0a3764" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 2 8l10 5 10-5-10-5Z" />
              <path d="M6 10.5V16c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5.5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '4.2cqw', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Your School Name</div>
            <div style={{ fontSize: '2.4cqw', fontStyle: 'italic', opacity: 0.85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Broward County Public Schools</div>
          </div>
          <div style={{ fontSize: '5cqw', lineHeight: 1, flexShrink: 0 }}>☰</div>
        </div>
        <div className="bwp-narrow-only" style={{ background: '#0a3764', color: '#fff', padding: '10px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Your School Name</div>
          <div style={{ fontSize: 11, fontStyle: 'italic', opacity: 0.85 }}>Broward County Public Schools</div>
        </div>

        {/* Hero: the active banner's file. Wide-container variant
            overlays the nav + title/caption on the image like the
            real sites do; narrow-container variant matches the real
            sites' mobile layout, where both move below the image. */}
        {/* Same 1920 x 800 (2.4 : 1) frame as the live homepage
            banner, cropped the same way (object-fit cover), so
            anything cut off on the school site is cut off here too.
            Was 2880 / 1600 (1.8 : 1), which showed more of the top
            and bottom than the live site does: heads Vanessa
            Deslandes and Rudy saw in this preview were cropped on the
            real site (2026-10-05). */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: `${MIN_WIDTH} / ${MIN_HEIGHT}`, background: '#000', overflow: 'hidden' }}>
          {kind === 'video' ? (
            <video src={url} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <img src={url} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {/* Matches the real school sites' actual nav treatment (checked
              against a live BCPS school site, 2026-09-03) - a stack of
              solid white button rows, not a tinted overlay bar: navy
              bold uppercase text, thin navy divider between rows. */}
          <div className="bwp-wide-only" style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: '22%', minWidth: 120,
            flexDirection: 'column',
          }}>
            {RIGHT_NAV_ITEMS.map((item, i) => (
              <div key={item} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                background: '#fff', color: '#0a3764', fontSize: '2.1cqw', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.01em', lineHeight: 1.15, padding: '2% 8%',
                borderBottom: i < RIGHT_NAV_ITEMS.length - 1 ? '2px solid #0a3764' : 'none',
              }}>
                {item}
              </div>
            ))}
          </div>
          {/* The WCM's own banner title, and caption beneath it in
              smaller text, live as they type - nothing until they
              enter one (Vanessa Deslandes, 2026-09-29 / 2026-10-02). */}
          {(title || caption) && (
            <div className="bwp-wide-only" style={{
              position: 'absolute', left: '3cqw', bottom: '4cqw', right: '25%', color: '#fff',
              flexDirection: 'column', gap: '0.8cqw', textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            }}>
              {title && <div style={{ fontSize: '4.2cqw', fontWeight: 800, lineHeight: 1.15 }}>{title}</div>}
              {caption && <div style={{ fontSize: '2.3cqw', fontWeight: 600, lineHeight: 1.3 }}>{caption}</div>}
            </div>
          )}
        </div>

        {/* Narrow-container variant: title, caption + full-width
            stacked nav rows below the image, matching the real
            sites' mobile layout. */}
        <div className="bwp-narrow-only">
          {(title || caption) && (
            <div style={{ background: '#0a3764', color: '#fff', textAlign: 'center', padding: '16px 10px' }}>
              {title && <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>}
              {caption && <div style={{ fontWeight: 500, fontSize: 13, marginTop: title ? 6 : 0 }}>{caption}</div>}
            </div>
          )}
          {RIGHT_NAV_ITEMS.map(item => (
            <div key={item} style={{
              background: '#fff', color: '#0a3764', fontWeight: 700, fontSize: 13,
              textAlign: 'center', padding: '14px 10px', borderBottom: '1px solid #0a3764',
            }}>
              {item.toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export default function BannerWidget() {
  // ?tab=mine or ?tab=removal opens that tab directly (the school home's
  // "Your Submissions" tile, 2026-10-05). Internal tabs are not linkable.
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'upload'
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'mine' || t === 'removal' ? t : 'upload'
  })
  // "View as" preview state, see canReview below.
  const { viewAs } = useBCPSShell()
  const previewingWcm = !!viewAs && viewAs.id !== SAMPLE_SUPERADMIN_ID
  const previewFrameRef = useRef<HTMLDivElement | null>(null)
  // null resets to fluid (100% of the column, grows/shrinks with the page -
  // per Sean, 2026-09-03, so the preview always matches the width of the
  // school dropdown and fields above it instead of sitting in a capped box).
  // A pixel value is a manual override for testing a narrower breakpoint;
  // maxWidth: '100%' on the frame keeps it from ever exceeding the column.
  const setPreviewFrameWidth = (px: number | null) => {
    if (previewFrameRef.current) previewFrameRef.current.style.width = px === null ? '100%' : `${px}px`
  }
  const [myRole, setMyRole] = useState<'admin' | 'manager' | null>(null)

  // ---- New Upload state ----
  // Up to three banners per request, each its own file, title, caption and
  // alt text (Vanessa Deslandes, 2026-10-02: each file is a separate banner).
  // School and the two acknowledgements are shared across the request.
  // Each item carries its own pixel measurement and automated content scan
  // (lib/bannerVision.ts via /api/banner/scan), which run the instant its
  // file is chosen - "upfront" per Sean, 2026-09-03. /api/banner/submit
  // re-runs the scan server-side as the real gate. A video skips the pixel
  // check and the scan (no frame pipeline yet) and is flagged for review.
  const [items, setItems] = useState<BannerItem[]>(() => [newBannerItem()])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const active = items.find(i => i.key === activeKey) ?? items[0]
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => () => { itemsRef.current.forEach(i => { if (i.previewUrl) URL.revokeObjectURL(i.previewUrl) }) }, [])
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)

  // ---- Request Removal state ----
  const [removalTargetId, setRemovalTargetId] = useState('')
  const [removalDesc, setRemovalDesc] = useState('')
  const [removalSubmitting, setRemovalSubmitting] = useState(false)
  const [removalNotice, setRemovalNotice] = useState<string | null>(null)

  // ---- My submissions ----
  const [mine, setMine] = useState<MySubmission[]>([])
  const [mineLoading, setMineLoading] = useState(true)

  // ---- Review queue (admin/manager) ----
  const [reviewItems, setReviewItems] = useState<ReviewSubmission[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectCategory, setRejectCategory] = useState('')
  const [rejectOtherComment, setRejectOtherComment] = useState('')
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)
  // Status filter (Vanessa Deslandes, 2026-09-29). Approved splits in two:
  // Ready to post (approved, not yet on the school site) and Posted (marked
  // done by the team). Defaults to Pending, the work waiting on them.
  type ReviewFilter = 'pending' | 'ready' | 'posted' | 'rejected' | 'all'
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('pending')
  const [postingId, setPostingId] = useState<string | null>(null)
  const matchesReviewFilter = (r: ReviewSubmission, f: ReviewFilter) =>
    f === 'all' ? true
      : f === 'ready' ? r.status === 'approved' && !r.posted_at && r.type === 'upload'
      : f === 'posted' ? r.status === 'approved' && !!r.posted_at
      : f === 'pending' ? r.status === 'pending'
      : f === 'rejected' ? r.status === 'rejected'
      : false

  // ---- Admin management (admin only) ----
  const [admins, setAdmins] = useState<BannerAdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'manager'>('manager')
  const [adminNotice, setAdminNotice] = useState<string | null>(null)
  // Review Queue: submission whose school-site preview is open enlarged.
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  // School WCM invites (Sean + Vanessa Deslandes, 2026-10-05) - see
  // /api/banner/wcm-invite.
  const [schoolWcms, setSchoolWcms] = useState<Array<{ name: string; wcm_name: string | null; wcm_email: string; school_location_nbr: string | null }>>([])
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoc, setInviteLoc] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteNotice, setInviteNotice] = useState<{ ok: boolean; text: string } | null>(null)

  async function authedFetch(path: string, init?: RequestInit) {
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) }
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(path, { ...init, headers })
  }

  async function loadMine() {
    setMineLoading(true)
    try {
      const res = await authedFetch('/api/banner/mine')
      const data = await res.json()
      setMine(data.submissions || [])
    } catch {
      // best-effort - widget still usable for new submissions
    } finally {
      setMineLoading(false)
    }
  }

  async function loadMyRoleAndAdmins() {
    try {
      const res = await authedFetch('/api/banner/admins')
      const data = await res.json()
      setMyRole(data.my_role || null)
      setAdmins(data.admins || [])
    } catch {
      setMyRole(null)
    }
  }

  async function loadSchoolWcms() {
    try {
      const res = await authedFetch('/api/banner/wcm-invite')
      const data = await res.json()
      if (res.ok) setSchoolWcms(data.wcms || [])
    } catch {
      // best-effort - the invite form still works
    }
  }

  async function handleInviteWcm(resend?: { name: string; email: string; loc: string }) {
    const payload = resend ?? { name: inviteName.trim(), email: inviteEmail.trim(), loc: inviteLoc }
    setInviteNotice(null)
    if (!payload.name || !payload.email || !payload.loc) {
      setInviteNotice({ ok: false, text: 'Enter a name, an email, and a school.' })
      return
    }
    setInviteBusy(true)
    try {
      const res = await authedFetch('/api/banner/wcm-invite', {
        method: 'POST',
        body: JSON.stringify({ name: payload.name, email: payload.email, loc_no: payload.loc }),
      })
      const data = await res.json()
      if (!res.ok) {
        setInviteNotice({ ok: false, text: data.error || 'Could not send the invite.' })
      } else {
        const who = `${payload.email} (${data.school})`
        setInviteNotice({
          ok: data.email_sent,
          text: data.email_sent
            ? (data.status === 'invited' ? `Invite sent to ${who}.` : `${who} already had an account. A sign-in email was sent.`)
            : `Account is set up for ${who}, but the email did not send: ${data.email_error || 'unknown error'}.`,
        })
        if (!resend) { setInviteName(''); setInviteEmail(''); setInviteLoc('') }
        loadSchoolWcms()
      }
    } catch {
      setInviteNotice({ ok: false, text: 'Could not send the invite.' })
    } finally {
      setInviteBusy(false)
    }
  }

  async function loadReviewQueue() {
    setReviewLoading(true)
    try {
      const res = await authedFetch('/api/banner/review')
      const data = await res.json()
      if (res.ok) setReviewItems(data.submissions || [])
    } catch {
      // best-effort
    } finally {
      setReviewLoading(false)
    }
  }

  useEffect(() => {
    loadMine()
    loadMyRoleAndAdmins()
  }, [])

  // Leaving an internal tab when a preview hides it.
  useEffect(() => {
    if (previewingWcm && (tab === 'review' || tab === 'admins' || tab === 'wcms')) setTab('upload')
  }, [previewingWcm, tab])

  useEffect(() => {
    if (tab === 'review') loadReviewQueue()
    if (tab === 'admins') loadMyRoleAndAdmins()
    if (tab === 'wcms') loadSchoolWcms()
  }, [tab])

  // Esc closes the enlarged preview.
  useEffect(() => {
    if (!lightboxId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxId])

  // "View as" a WCM or District Web Team sample: show only the WCM tabs, the
  // way a WCM sees this page (Sean + Vanessa Deslandes, 2026-09-29). Data is
  // still the real signed-in account's - submissions made while previewing
  // are real and land in the review queue like any other.
  const canReview = !previewingWcm && (myRole === 'admin' || myRole === 'manager')
  const isAdmin = !previewingWcm && myRole === 'admin'
  const myUploads = mine.filter(m => m.type === 'upload')

  // ---- School selector (Explicit model) ----
  const [schools, setSchools] = useState<Array<{ loc_no: string; school_name: string }>>([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [selectedSchool, setSelectedSchool] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authedFetch('/api/banner/schools')
        const data = await res.json()
        if (!cancelled) setSchools(data.schools || [])
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setSchoolsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(f)
    })
  }

  function patchItem(key: string, patch: Partial<BannerItem>) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i))
  }
  // Async results only land if that slot still holds the same file.
  function patchIfSameFile(key: string, f: File, patch: Partial<BannerItem>) {
    setItems(prev => prev.map(i => i.key === key && i.file === f ? { ...i, ...patch } : i))
  }

  function chooseFile(key: string, f: File | null) {
    const prevUrl = itemsRef.current.find(i => i.key === key)?.previewUrl
    if (prevUrl) URL.revokeObjectURL(prevUrl)
    setActiveKey(key)
    if (!f) {
      patchItem(key, { file: null, previewUrl: null, kind: null, dims: null, scanState: 'idle', scanResult: null, scanError: null, inSceneText: false, orientation: null })
      return
    }
    const url = URL.createObjectURL(f)
    const kind: 'image' | 'video' = f.type.startsWith('video') ? 'video' : 'image'
    patchItem(key, { file: f, previewUrl: url, kind, dims: null, scanState: 'scanning', scanResult: null, scanError: null, inSceneText: false, orientation: null })

    if (kind === 'image') {
      const img = new Image()
      img.onload = () => patchIfSameFile(key, f, { dims: { width: img.naturalWidth, height: img.naturalHeight } })
      img.src = url
      readJpegOrientation(f).then(o => patchIfSameFile(key, f, { orientation: o })).catch(() => {})
    }

    ;(async () => {
      try {
        if (kind === 'video') {
          patchIfSameFile(key, f, { scanResult: { no_overlays_pass: true, nav_clearance_pass: true, reasons: [] }, scanState: 'degraded' })
          return
        }
        const b64 = await fileToBase64(f)
        const res = await authedFetch('/api/banner/scan', {
          method: 'POST',
          body: JSON.stringify({ file_base64: b64, mime_type: f.type }),
        })
        const data = await res.json()
        if (!res.ok) {
          // Hard failure (auth, network, etc.) - genuinely blocks, unlike
          // the fail-open case below.
          patchIfSameFile(key, f, { scanError: data.error || 'Automated scan failed.', scanState: 'error' })
        } else if (data.skipped && data.error) {
          // Fail-open: the scanner itself is unavailable (e.g. API outage),
          // not a content violation - submission is allowed to proceed
          // flagged for manual review, matching /api/banner/submit's policy.
          patchIfSameFile(key, f, { scanResult: { no_overlays_pass: true, nav_clearance_pass: true, reasons: [] }, scanError: data.error, scanState: 'degraded' })
        } else {
          patchIfSameFile(key, f, {
            scanResult: {
              no_overlays_pass: !!data.no_overlays_pass,
              nav_clearance_pass: !!data.nav_clearance_pass,
              nav_clearance_note: data.nav_clearance_note,
              text_detected: !!data.text_detected,
              reasons: data.reasons || [],
            },
            scanState: 'done',
          })
        }
      } catch {
        patchIfSameFile(key, f, { scanError: 'Automated scan failed - please try re-selecting the file.', scanState: 'error' })
      }
    })()
  }

  function addItem() {
    if (items.length >= MAX_FILES) return
    const item = newBannerItem()
    setItems(prev => [...prev, item])
    setActiveKey(item.key)
  }

  function removeItem(key: string) {
    const gone = items.find(i => i.key === key)
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
    setItems(prev => {
      const next = prev.filter(i => i.key !== key)
      return next.length ? next : [newBannerItem()]
    })
    if (activeKey === key) setActiveKey(null)
  }

  // Slots without a file are ignored (not submitted, not validated), so an
  // extra "Add another banner" the WCM never used does not block submit.
  const filled = items.filter(i => i.file)
  const allChecked = CHECKLIST.every(c => checks[c.key])
  const dimsOk = (i: BannerItem) => i.kind === 'video' ? true : !!(i.dims && i.dims.width >= MIN_WIDTH && i.dims.height >= MIN_HEIGHT)
  const overlaysOk = (i: BannerItem) => !!i.scanResult?.no_overlays_pass && (!i.scanResult?.text_detected || i.inSceneText)
  const needsConfirm = (i: BannerItem) => i.scanState === 'done' && !!i.scanResult?.no_overlays_pass && !!i.scanResult?.text_detected && !i.inSceneText
  const scanFailed = (i: BannerItem) => i.scanState === 'done' && !!i.scanResult && !i.scanResult.no_overlays_pass
  const all = (pred: (i: BannerItem) => boolean) => filled.length > 0 && filled.every(pred)

  // Live Validation checklist status (right-hand panel) - each row derived
  // from current form state across every banner in the request, matching
  // Vanessa's mockup's per-item Pass display. See VALIDATION_CHECKLIST.
  const validationStatus: Record<string, boolean> = {
    school: !!selectedSchool,
    files: filled.length > 0,
    dims: all(dimsOk),
    no_overlays: all(overlaysOk),
    nav_clearance: all(i => !!i.scanResult?.nav_clearance_pass),
    title: all(i => i.title.trim() !== ''),
    alt: all(i => i.alt.trim() !== ''),
    approvals: !!checks.media_release && !!checks.faces_visible,
    final_ack: !!checks.final_ack,
  }
  const allValidationPassed = VALIDATION_CHECKLIST.every(v => validationStatus[v.key])

  // Display-only companion to validationStatus above: which rows have
  // actually FAILED versus which are merely not done yet. Only the rows the
  // tool itself adjudicates can reach 'fail'; an inconclusive or in-flight
  // scan stays 'pending'. See VALIDATION_CHIP.
  const validationState: Record<string, ValidationState> = {
    school: validationStatus.school ? 'pass' : 'pending',
    files: validationStatus.files ? 'pass' : 'pending',
    // A video is exempt from the pixel minimum, so only a measured still
    // image can fail this row.
    dims: validationStatus.dims ? 'pass' : (filled.some(i => i.kind === 'image' && i.dims && !dimsOk(i)) ? 'fail' : 'pending'),
    no_overlays: validationStatus.no_overlays ? 'pass'
      : filled.some(scanFailed) ? 'fail'
      : filled.some(needsConfirm) ? 'confirm'
      : 'pending',
    nav_clearance: validationStatus.nav_clearance ? 'pass'
      : (filled.some(i => i.scanState === 'done' && !!i.scanResult && !i.scanResult.nav_clearance_pass) ? 'fail' : 'pending'),
    title: validationStatus.title ? 'pass' : 'pending',
    alt: validationStatus.alt ? 'pass' : 'pending',
    approvals: validationStatus.approvals ? 'pass' : 'pending',
    final_ack: validationStatus.final_ack ? 'pass' : 'pending',
  }

  async function handleSubmitUpload() {
    setUploadNotice(null)
    if (!selectedSchool) { setUploadNotice('Select your school first.'); return }
    if (filled.length === 0) { setUploadNotice('Choose a photo or video first.'); return }
    for (let n = 0; n < filled.length; n++) {
      const i = filled[n]
      const name = filled.length > 1 ? `Banner ${n + 1}: ` : ''
      if (!i.title.trim()) { setUploadNotice(`${name}Banner title is required.`); return }
      if (!i.alt.trim()) { setUploadNotice(`${name}Alternative text is required.`); return }
      if (i.scanState === 'scanning') { setUploadNotice(`${name}Still running the automated content scan - one moment.`); return }
      if (i.scanState === 'error') { setUploadNotice(`${name}${i.scanError || 'The automated content scan failed - please try re-selecting the file.'}`); return }
      if (!i.scanResult?.no_overlays_pass || !i.scanResult?.nav_clearance_pass) { setUploadNotice(`${name}This image needs to pass the automated content scan before it can be submitted.`); return }
      if (i.scanResult?.text_detected && !i.inSceneText) { setUploadNotice(`${name}Text was detected - confirm it is part of the actual scene before submitting.`); return }
    }
    if (!allChecked) { setUploadNotice('All requirement checkboxes must be checked before submitting.'); return }

    // One /api/banner/submit call per banner, in order. A banner that saves
    // leaves the form; one that fails stays with its error so the WCM can fix
    // it and resubmit without re-entering the others.
    setSubmitting(true)
    const failures: string[] = []
    let sent = 0
    for (let n = 0; n < filled.length; n++) {
      const i = filled[n]
      const name = filled.length > 1 ? `Banner ${n + 1}` : 'Submission'
      try {
        const base64 = await fileToBase64(i.file!)
        const res = await authedFetch('/api/banner/submit', {
          method: 'POST',
          body: JSON.stringify({
            file_base64: base64,
            file_name: i.file!.name,
            mime_type: i.file!.type,
            banner_title: i.title,
            banner_caption: i.caption,
            alt_text: i.alt,
            checklist_ack: { ...checks, in_scene_text: i.inSceneText },
            school_location_nbr: selectedSchool,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { failures.push(`${name}: ${data.error || 'Submission failed.'}`); continue }
        sent++
        if (i.previewUrl) URL.revokeObjectURL(i.previewUrl)
        setItems(prev => prev.filter(p => p.key !== i.key))
      } catch {
        failures.push(`${name}: Submission failed - please try again.`)
      }
    }
    setSubmitting(false)
    setItems(prev => prev.length ? prev : [newBannerItem()])
    setActiveKey(null)
    if (failures.length === 0) {
      setChecks({})
      setUploadNotice(sent === 1 ? 'Submitted to the District Web Team for review.' : `Submitted ${sent} banners to the District Web Team for review.`)
    } else {
      setUploadNotice(`${failures.join(' ')}${sent > 0 ? ` (${sent} other ${sent === 1 ? 'banner was' : 'banners were'} submitted.)` : ''}`)
    }
    if (sent > 0) loadMine()
  }

  async function handleSubmitRemoval() {
    setRemovalNotice(null)
    if (!removalTargetId) { setRemovalNotice('Select which submission to remove.'); return }
    if (!removalDesc.trim()) { setRemovalNotice('A description identifying the file is required.'); return }

    setRemovalSubmitting(true)
    try {
      const res = await authedFetch('/api/banner/removal', {
        method: 'POST',
        body: JSON.stringify({
          target_submission_id: removalTargetId,
          removal_description: removalDesc,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setRemovalNotice(data.error || 'Request failed.'); return }
      setRemovalNotice('Removal request sent to the District Web Team.')
      setRemovalTargetId(''); setRemovalDesc('')
      loadMine()
    } catch {
      setRemovalNotice('Request failed - please try again.')
    } finally {
      setRemovalSubmitting(false)
    }
  }

  async function handleReviewAction(id: string, action: 'approve' | 'reject') {
    setReviewNotice(null)
    if (action === 'reject' && rejectingId !== id) {
      setRejectingId(id)
      setRejectCategory('')
      setRejectOtherComment('')
      return
    }
    let rejectionReason = ''
    if (action === 'reject') {
      if (!rejectCategory) { setReviewNotice('A rejection reason is required.'); return }
      if (rejectCategory === 'Other') {
        if (!rejectOtherComment.trim()) { setReviewNotice('A comment is required when reason is "Other".'); return }
        rejectionReason = `Other: ${rejectOtherComment.trim()}`
      } else {
        rejectionReason = rejectCategory
      }
    }
    try {
      const res = await authedFetch('/api/banner/review', {
        method: 'POST',
        body: JSON.stringify({ id, action, rejection_reason: action === 'reject' ? rejectionReason : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setReviewNotice(data.error || 'Action failed.'); return }
      if (action === 'reject') {
        setReviewNotice(data.emailed ? 'Rejected - notification email sent to the WCM.' : `Rejected - ${data.warning || 'email not sent.'}`)
      } else {
        setReviewNotice(data.emailed ? 'Approved - email sent to the WCM.' : data.warning ? `Approved - ${data.warning}` : 'Approved.')
      }
      setRejectingId(null)
      setRejectCategory('')
      setRejectOtherComment('')
      loadReviewQueue()
    } catch {
      setReviewNotice('Action failed - please try again.')
    }
  }

  async function handleMarkPosted(id: string, posted: boolean) {
    setReviewNotice(null)
    setPostingId(id)
    try {
      const res = await authedFetch('/api/banner/review', {
        method: 'POST',
        body: JSON.stringify({ id, action: posted ? 'mark_posted' : 'unmark_posted' }),
      })
      const data = await res.json()
      if (!res.ok) { setReviewNotice(data.error || 'Could not update.'); return }
      loadReviewQueue()
    } catch {
      setReviewNotice('Could not update - please try again.')
    } finally {
      setPostingId(null)
    }
  }

  async function handleAddAdmin() {
    setAdminNotice(null)
    if (!newAdminEmail.trim()) { setAdminNotice('Email is required.'); return }
    setAdminsLoading(true)
    try {
      const res = await authedFetch('/api/banner/admins', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', email: newAdminEmail.trim(), role: newAdminRole }),
      })
      const data = await res.json()
      if (!res.ok) { setAdminNotice(data.error || 'Could not add.'); return }
      setNewAdminEmail('')
      loadMyRoleAndAdmins()
    } catch {
      setAdminNotice('Could not add - please try again.')
    } finally {
      setAdminsLoading(false)
    }
  }

  async function handleRemoveAdmin(user_id: string) {
    setAdminNotice(null)
    setAdminsLoading(true)
    try {
      const res = await authedFetch('/api/banner/admins', {
        method: 'POST',
        body: JSON.stringify({ action: 'remove', user_id }),
      })
      const data = await res.json()
      if (!res.ok) { setAdminNotice(data.error || 'Could not remove.'); return }
      loadMyRoleAndAdmins()
    } catch {
      setAdminNotice('Could not remove - please try again.')
    } finally {
      setAdminsLoading(false)
    }
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'upload', label: 'New Upload' },
    { id: 'removal', label: 'Request Removal' },
    { id: 'mine', label: 'My Submissions' },
  ]
  // Internal District Web Team tabs, kept visually apart from the three WCM
  // tabs (Vanessa Deslandes, 2026-09-29): BCPS gold instead of navy, behind
  // a divider and a "District Web Team" label, so nobody mistakes the review
  // tools for part of the WCM flow.
  const internalTabs: Array<{ id: Tab; label: string }> = []
  if (canReview) internalTabs.push({ id: 'review', label: 'Review Queue' })
  if (canReview) internalTabs.push({ id: 'wcms', label: 'School WCMs' })
  if (isAdmin) internalTabs.push({ id: 'admins', label: 'Manage Admins' })

  const GOLD = '#F4C436'
  const GOLD_TEXT = '#5c4300'

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <h3>Banner Submissions</h3>
      </div>

      {previewingWcm && (
        <div style={{ fontSize: 12, background: '#fffaeb', color: '#5c4300', border: '1px solid #F4C436', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <strong>Viewing as {viewAs!.roleLabel.replace(' (Sample)', '')}.</strong> You see what they see. Anything you submit
          here is a real submission from your own account and goes to the Review Queue.
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={tab === t.id ? 'btn-primary' : 'btn-outline'}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {t.label}
          </button>
        ))}
        {internalTabs.length > 0 && (
          <>
            <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 6px' }} />
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: GOLD_TEXT }}>
              District Web Team
            </span>
            {internalTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="btn-outline"
                style={{
                  fontSize: 12, padding: '6px 12px', fontWeight: 700,
                  background: tab === t.id ? GOLD : '#fffaeb',
                  borderColor: GOLD, color: GOLD_TEXT,
                }}
              >
                {t.label}
              </button>
            ))}
          </>
        )}
      </div>

      {tab === 'upload' && (
        <div>
          <style>{`
            .bwp-layout { display: grid; grid-template-columns: 1fr; gap: 16px; }
            @media (min-width: 760px) {
              .bwp-layout { grid-template-columns: 1fr 300px; align-items: start; }
            }
          `}</style>
          <div className="bwp-layout">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, minWidth: 0 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>School *</label>
              <select
                value={selectedSchool}
                onChange={e => setSelectedSchool(e.target.value)}
                className="form-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
                disabled={schoolsLoading}
              >
                <option value="">{schoolsLoading ? 'Loading schools...' : 'Select your school...'}</option>
                {schools.map(s => (
                  <option key={s.loc_no} value={s.loc_no}>{s.school_name} &ndash; {s.loc_no}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                If you manage more than one school, submit this form once per school.
              </div>
            </div>

            {/* Identity Banner Guidelines sheet (Vanessa Deslandes,
                2026-10-02) - the same image the rejection email embeds, so
                WCMs see the rules before they submit. */}
            <details style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
              <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Identity Banner Guidelines: see approved and not approved examples
              </summary>
              <div style={{ fontSize: 12, margin: '8px 0' }}>
                Horizontal images only, leave open space on the right so faces are not blocked by the navigation, and keep
                images clean and free of text, logos, and graphics.
              </div>
              <img src="/banner-guidelines.jpg" alt="Identity Banner Guidelines: approved and not approved examples for horizontal images, space on the right, and text-free images." style={{ width: '100%', maxWidth: 560, height: 'auto', display: 'block', borderRadius: 4 }} />
            </details>

            {/* Live preview: mocks the actual school-site header + homepage
                banner + right-nav (a generic logo/title stand in for the real
                school chrome, since this tool serves every school), with the
                active banner's file composited into the hero, so a WCM can
                self-check quality, pixelation, absence of text/logos, and
                whether the nav blocks faces - per Vanessa Deslandes,
                2026-08-24. Reflows at container width the same way the real
                school sites do (header chrome and hero overlay drop away
                below ~480px, nav items become full-width stacked rows) - per
                Sean, 2026-09-02. Drag the bottom-right corner of the frame,
                or use the width presets, to test narrower widths. */}
            {(() => {
              const displayUrl = active.previewUrl || PLACEHOLDER_IMAGE
              const displayKind = active.previewUrl ? active.kind : 'image'
              const title = active.title.trim()
              const caption = active.caption.trim()
              return (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Live preview</label>

                <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[{ label: 'Desktop', px: null as number | null }, { label: 'Tablet', px: 768 }, { label: 'Mobile', px: 375 }].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setPreviewFrameWidth(p.px)}
                      className="btn-outline"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                    >
                      {p.label}
                    </button>
                  ))}
                  {items.length > 1 && (
                    <>
                      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 4px' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Showing</span>
                      {items.map((it, n) => (
                        <button
                          key={it.key}
                          type="button"
                          aria-pressed={it.key === active.key}
                          onClick={() => setActiveKey(it.key)}
                          className={it.key === active.key ? 'btn-primary' : 'btn-outline'}
                          style={{ fontSize: 11, padding: '4px 10px' }}
                        >
                          Banner {n + 1}
                        </button>
                      ))}
                    </>
                  )}
                </div>

                <BannerSiteFrame url={displayUrl} kind={displayKind} alt={active.previewUrl ? 'Banner preview' : 'Sample banner placeholder'} title={title} caption={caption} frameRef={previewFrameRef} resizable />

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {active.previewUrl
                    ? 'This preview mirrors the real school-site header, homepage banner, and navigation, including how they reflow on a smaller screen. Drag the frame’s bottom-right corner (or use the width buttons above) to check narrower widths. Make sure faces and important subjects stay clear of the right-hand nav.'
                    : 'This is a sample image showing how your upload will look on the homepage. Choose a photo or video below and it will replace this placeholder automatically.'}
                </div>
              </div>
              )
            })()}

            {/* One card per banner (up to MAX_FILES). Each has its own file,
                automated scan, title, caption and alt text. Focusing a card
                shows it in the live preview. */}
            {items.map((it, n) => (
              <div
                key={it.key}
                onFocusCapture={() => setActiveKey(it.key)}
                style={{
                  border: `1px solid ${it.key === active.key && items.length > 1 ? '#0a3764' : 'var(--border)'}`,
                  borderRadius: 8, padding: 12, display: 'grid', gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>
                    Banner {n + 1}
                    {n > 0 && <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}> (optional)</span>}
                  </div>
                  {items.length > 1 && (
                    <button type="button" className="btn-outline" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => removeItem(it.key)}>
                      Remove
                    </button>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Photo or video{n === 0 ? ' *' : ''}</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,video/mp4"
                    onChange={(e) => chooseFile(it.key, e.target.files?.[0] || null)}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Image: 1920 x 800 px or larger, same wide shape (the Finalsite homepage banner standard). Video: MP4 only, max 30 seconds, 1080p HD recommended (not 4K).
                  </div>
                  {/* The size this tool measured, so a Fail on the size row
                      always says why (Vanessa Deslandes, 2026-10-02). */}
                  {it.kind === 'image' && it.dims && (
                    <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600, color: dimsOk(it) ? '#1e6b3a' : '#a13a2f' }}>
                      Measured size: {it.dims.width} &times; {it.dims.height} px
                      {dimsOk(it) ? ' - meets the minimum.' : ` - below the ${MIN_WIDTH} \u00d7 ${MIN_HEIGHT} px minimum.`}
                    </div>
                  )}
                  {it.kind === 'image' && it.dims && (it.orientation ?? 1) >= 5 && (
                    <div style={{ fontSize: 12, marginTop: 4, background: '#fdf3e0', color: '#8a5a00', padding: '6px 10px', borderRadius: 5 }}>
                      This photo has a rotation setting from the camera. Browsers and school websites apply it, so it
                      measures {it.dims.width} &times; {it.dims.height} px here even if your computer lists
                      {' '}{it.dims.height} &times; {it.dims.width}. If it looks sideways or tall in the preview, open it in
                      Photos, rotate it so it is wide and upright, save a copy, and upload that copy.
                    </div>
                  )}
                </div>

                {/* Automated Photo Content Requirements scan - shown right
                    where it runs, per Sean 2026-09-03. Only once a real file
                    is selected. */}
                {it.file && (
                  <div style={{
                    borderRadius: 6, padding: '10px 12px', fontSize: 12.5,
                    background: it.scanState === 'scanning' ? '#f3f4f6'
                      : it.scanState === 'error' ? '#fbe9e7'
                      : it.scanState === 'degraded' ? '#fdf3e0'
                      : !(it.scanResult?.no_overlays_pass && it.scanResult?.nav_clearance_pass) ? '#fbe9e7'
                      : it.scanResult?.text_detected ? '#fdf3e0' : '#e6f4ea',
                    color: it.scanState === 'scanning' ? '#4b5563'
                      : it.scanState === 'error' ? '#a13a2f'
                      : it.scanState === 'degraded' ? '#8a5a00'
                      : !(it.scanResult?.no_overlays_pass && it.scanResult?.nav_clearance_pass) ? '#a13a2f'
                      : it.scanResult?.text_detected ? '#8a5a00' : '#1e6b3a',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: it.scanResult?.reasons?.length ? 4 : 0 }}>
                      {it.scanState === 'scanning' && 'Scanning image for graphics, text overlays, and nav clearance...'}
                      {it.scanState === 'error' && `Automated scan failed: ${it.scanError}`}
                      {it.scanState === 'degraded' && 'Automated scan unavailable for this file - it will be flagged for the District Web Team to review manually.'}
                      {it.scanState === 'done' && (!(it.scanResult?.no_overlays_pass && it.scanResult?.nav_clearance_pass)
                        ? 'Automated content scan flagged this image - it cannot be submitted as-is.'
                        : it.scanResult?.text_detected
                          ? 'Text detected in this image - please confirm below.'
                          : 'Automated content scan passed.')}
                    </div>
                    {it.scanResult?.reasons && it.scanResult.reasons.length > 0 && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {it.scanResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                    {/* In-scene text attestation (Vanessa Deslandes, 2026-09-29):
                        a sign someone is holding is fine; text added on top of
                        the photo is not. OCR can't tell which, so the WCM says,
                        and the District Web Team makes the final call. The text
                        the scanner read is not shown here (Vanessa Deslandes,
                        2026-10-02: often unreadable); only the review queue
                        shows it. */}
                    {it.scanState === 'done' && it.scanResult?.no_overlays_pass && it.scanResult?.text_detected && (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', color: '#4b3200', marginTop: 6 }}>
                        <input
                          type="checkbox"
                          checked={it.inSceneText}
                          onChange={e => patchItem(it.key, { inSceneText: e.target.checked })}
                          style={{ marginTop: 2 }}
                        />
                        <span>The text is part of the actual scene (a sign or banner in the photo), not added as a graphic. The District Web Team will make the final call.</span>
                      </label>
                    )}
                    {it.scanState === 'done' && it.scanResult?.nav_clearance_note && (
                      <div style={{ marginTop: 6, fontWeight: 400, color: '#8a5a00' }}>{it.scanResult.nav_clearance_note}</div>
                    )}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Banner title *</label>
                  <input type="text" maxLength={TITLE_MAX} value={it.title} onChange={e => patchItem(it.key, { title: e.target.value })} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                  <CharCount value={it.title} max={TITLE_MAX} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Banner caption (optional)</label>
                  <input type="text" maxLength={CAPTION_MAX} value={it.caption} onChange={e => patchItem(it.key, { caption: e.target.value })} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                  <CharCount value={it.caption} max={CAPTION_MAX} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Alternative text *</label>
                  <input type="text" value={it.alt} onChange={e => patchItem(it.key, { alt: e.target.value })} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
                </div>
              </div>
            ))}

            {/* Colored, headed box so the optional extra banners are not
                missed, and so it is clear one banner is enough to submit
                (Vanessa Deslandes, 2026-10-05). */}
            {items.length < MAX_FILES && (
              <div style={{
                background: '#eaf1f8', border: '2px dashed #0a3764', borderRadius: 8, padding: 14,
                display: 'grid', gap: 8,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0a3764' }}>Add another banner</div>
                <div style={{ fontSize: 12, color: '#1f2937' }}>
                  Optional. One photo or video is all you need to submit. If you have more for your school&apos;s homepage,
                  you can add up to {MAX_FILES} in this request ({MAX_FILES - items.length} more available).
                </div>
                <button type="button" className="btn-primary" onClick={addItem} style={{ justifySelf: 'start', fontSize: 12.5, padding: '7px 14px' }}>
                  + Add another banner
                </button>
              </div>
            )}

            {/* Submission requirement acknowledgements - the two items the
                tool cannot check for itself (media release on file, final
                sign-off). They cover every banner in this request. See
                CHECKLIST comment above. */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Submission requirement acknowledgements</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                Review and confirm each required item before submitting for approval.
              </div>
              {['Approvals & Permissions', 'Final Acknowledgment'].map(section => (
                <div key={section} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{section}</div>
                  {CHECKLIST.filter(c => c.section === section).map(c => (
                    <label key={c.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, marginBottom: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!checks[c.key]}
                        onChange={e => setChecks(prev => ({ ...prev, [c.key]: e.target.checked }))}
                        style={{ marginTop: 2 }}
                      />
                      <span>{c.text}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Validation checklist - live per-item status, matching Vanessa's
              mockup (label, order, one row per criterion, updates the
              instant its condition is met). See VALIDATION_CHECKLIST. */}
          <div>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 16, position: 'sticky', top: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Validation checklist</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                All items must pass before review{filled.length > 1 ? `, for all ${filled.length} banners` : ''}.
              </div>
              {VALIDATION_CHECKLIST.map(v => {
                const chip = VALIDATION_CHIP[validationState[v.key]]
                return (
                  <div key={v.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    background: chip.bg, color: chip.fg, boxShadow: chip.ring,
                    borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 12.5, fontWeight: 600,
                  }}>
                    <span>{v.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{chip.label}</span>
                  </div>
                )
              })}
              <button
                className="btn-primary"
                disabled={submitting || !allValidationPassed}
                onClick={handleSubmitUpload}
                style={{ width: '100%', marginTop: 4 }}
              >
                {submitting ? 'Submitting...' : filled.length > 1 ? `Submit ${filled.length} banners for review` : 'Submit for review'}
              </button>
              {uploadNotice && (
                <div style={{ fontSize: 12, marginTop: 8, color: uploadNotice.startsWith('Submitted') ? '#1e6b3a' : '#a13a2f' }}>
                  {uploadNotice}
                </div>
              )}
              {/* Vanessa Deslandes, 2026-10-05: WCMs read "Submit" as "approved",
                  especially after a Pass on every row. */}
              <div style={{ fontSize: 12, color: '#0a3764', background: '#eaf1f8', borderRadius: 6, padding: '8px 10px', marginTop: 8, lineHeight: 1.45 }}>
                <strong>Submitting is not approval.</strong> The District Web Team checks every banner by eye before it
                goes live, including anything flagged for manual review above. You will get an email once it is approved
                or if changes are needed.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Up to {MAX_FILES} banners per request. Each banner is reviewed on its own.
              </div>
            </div>
          </div>
          </div>
        </div>
      )}

      {tab === 'removal' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Which submission should be removed? *</label>
            <select value={removalTargetId} onChange={e => setRemovalTargetId(e.target.value)} className="form-select" style={{ width: '100%', boxSizing: 'border-box' }}>
              <option value="">Select a prior submission...</option>
              {myUploads.map(u => (
                <option key={u.id} value={u.id}>{u.banner_title || u.file_name} ({u.status})</option>
              ))}
            </select>
            {myUploads.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>You have no prior uploads to remove yet.</div>}
          </div>
          {/* No target removal date (Vanessa Deslandes, 2026-09-29): removals
              can't be scheduled in advance, and a future date risks the team
              missing it. The day a request comes in is the day it's worked. */}
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            The District Web Team works removal requests as they come in - no need to pick a date.
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Description identifying the file *</label>
            <textarea value={removalDesc} onChange={e => setRemovalDesc(e.target.value)} className="form-input" style={{ width: '100%', minHeight: 70, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
          </div>
          {removalNotice && <div style={{ fontSize: 12.5, color: removalNotice.startsWith('Removal request sent') ? '#1e6b3a' : '#a13a2f' }}>{removalNotice}</div>}
          <div>
            <button className="btn-primary" disabled={removalSubmitting} onClick={handleSubmitRemoval}>
              {removalSubmitting ? 'Sending...' : 'Send removal request'}
            </button>
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="note-list">
          {mineLoading ? (
            <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
          ) : mine.length === 0 ? (
            <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>No submissions yet.</div>
          ) : mine.map(m => (
            <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {m.type === 'upload' ? (m.banner_title || m.file_name) : `Removal request: ${m.removal_description?.slice(0, 60)}`}
                </div>
                {statusBadge(m.status)}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {m.type === 'upload' ? 'New upload' : 'Removal request'} &middot; submitted {new Date(m.submitted_at).toLocaleDateString()}
              </div>
              {m.status === 'rejected' && m.rejection_reason && (
                <div style={{ fontSize: 12, color: '#a13a2f', marginTop: 6, background: '#fbe9e7', padding: '6px 10px', borderRadius: 5 }}>
                  {m.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'review' && (
        <div>
          {(() => {
            const lb = lightboxId ? reviewItems.find(x => x.id === lightboxId) : null
            if (!lb || !lb.signed_url) return null
            return (
              <div
                role="dialog" aria-modal="true" aria-label="School-site preview, enlarged"
                onClick={() => setLightboxId(null)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.78)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto',
                }}
              >
                <div onClick={e => e.stopPropagation()} style={{ width: 'min(1200px, 100%)', background: '#fff', borderRadius: 8, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 14 }}>{lb.banner_title || lb.file_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{lb.school_name ? `${lb.school_name} · ` : ''}{lb.wcm_email}</div>
                    </div>
                    <button type="button" className="btn-outline" autoFocus onClick={() => setLightboxId(null)} style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}>
                      Close
                    </button>
                  </div>
                  <BannerSiteFrame url={lb.signed_url} kind={lb.file_type} alt={lb.alt_text || ''} title={lb.banner_title || ''} caption={lb.banner_caption || ''} />
                </div>
              </div>
            )
          })()}
          {reviewNotice && <div style={{ fontSize: 12.5, marginBottom: 10, color: reviewNotice.startsWith('Approved') || reviewNotice.startsWith('Rejected') ? '#1e6b3a' : '#a13a2f' }}>{reviewNotice}</div>}
          <div role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {([
              { id: 'pending', label: 'Pending' },
              { id: 'ready', label: 'Ready to post' },
              { id: 'posted', label: 'Posted' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'all', label: 'All' },
            ] as const).map(f => {
              const count = reviewItems.filter(r => matchesReviewFilter(r, f.id)).length
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={reviewFilter === f.id}
                  onClick={() => setReviewFilter(f.id)}
                  className={reviewFilter === f.id ? 'btn-primary' : 'btn-outline'}
                  style={{ fontSize: 11.5, padding: '4px 10px' }}
                >
                  {f.label} ({count})
                </button>
              )
            })}
          </div>
          {reviewFilter === 'ready' && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
              Approved and not on the school site yet. Download original, post it, then click Mark as posted.
            </div>
          )}
          <div className="note-list">
            {reviewLoading ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : reviewItems.length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nothing submitted yet.</div>
            ) : reviewItems.filter(r => matchesReviewFilter(r, reviewFilter)).length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nothing here right now.</div>
            ) : reviewItems.filter(r => matchesReviewFilter(r, reviewFilter)).map(r => (
              <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {r.type === 'upload' ? (r.banner_title || r.file_name) : `Removal request: ${r.removal_description?.slice(0, 60)}`}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.school_name ? `${r.school_name} · ` : ''}{r.wcm_email} &middot; {new Date(r.submitted_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {r.posted_at && (
                      <span style={{ background: '#e0f2f1', color: '#0f766e', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>Posted</span>
                    )}
                    {statusBadge(r.status)}
                  </div>
                </div>
                {r.type === 'upload' && r.content_scan?.text_detected && (
                  <div style={{ marginTop: 8, fontSize: 12, background: '#fdf3e0', color: '#8a5a00', padding: '6px 10px', borderRadius: 5 }}>
                    <strong>Text detected</strong> - {r.checklist_ack?.in_scene_text ? 'WCM says it is part of the scene (sign or banner in the photo).' : 'not confirmed by the WCM.'}
                    {/* Hidden from the WCM, kept here for the team (Vanessa
                        Deslandes, 2026-10-02). OCR output, often garbled. */}
                    {r.content_scan.text_reason && (
                      <div style={{ marginTop: 2 }}>
                        Text detected by the scanner (may be inaccurate): {r.content_scan.text_reason.replace(/^Text overlay detected:\s*/, '')}
                      </div>
                    )}
                  </div>
                )}
                {r.type === 'upload' && r.signed_url && (
                  <div style={{ marginTop: 8 }}>
                    {/* Original file on the left, the same school-site frame
                        the WCM previewed on the right; click the frame for a
                        larger view (Vanessa Deslandes + Rudy Carril,
                        2026-10-05). */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flex: '0 1 320px', minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Submitted file</div>
                        {r.file_type === 'video' ? (
                          <video src={r.signed_url} controls style={{ width: '100%', maxWidth: 320, borderRadius: 5, display: 'block' }} />
                        ) : (
                          <img src={r.signed_url} alt={r.alt_text || ''} style={{ width: '100%', maxWidth: 320, borderRadius: 5, display: 'block' }} />
                        )}
                      </div>
                      <div style={{ flex: '1 1 320px', minWidth: 0, maxWidth: 560 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>On the school site (click to enlarge)</div>
                        <button
                          type="button"
                          onClick={() => setLightboxId(r.id)}
                          aria-label={`Enlarge the school-site preview for ${r.banner_title || r.file_name || 'this banner'}`}
                          style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', textAlign: 'left' }}
                        >
                          <div style={{ pointerEvents: 'none' }}>
                            <BannerSiteFrame url={r.signed_url} kind={r.file_type} alt={r.alt_text || ''} title={r.banner_title || ''} caption={r.banner_caption || ''} />
                          </div>
                        </button>
                      </div>
                    </div>
                    {r.alt_text && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Alt text: {r.alt_text}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                      {r.download_url && (
                        <a href={r.download_url} className="btn-outline" style={{ display: 'inline-flex', fontSize: 12, padding: '5px 10px', textDecoration: 'none', borderRadius: 8 }}>
                          Download original
                        </a>
                      )}
                      {/* Mark as posted (Sean + Vanessa Deslandes, 2026-09-29):
                          approved uploads only - moves it from Ready to post
                          to Posted, with who and when. Undo puts it back. */}
                      {r.status === 'approved' && (r.posted_at ? (
                        <>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            Posted {new Date(r.posted_at).toLocaleDateString()}{r.posted_by_email ? ` by ${r.posted_by_email}` : ''}
                          </span>
                          <button className="btn-outline" style={{ fontSize: 11.5, padding: '4px 8px' }} disabled={postingId === r.id} onClick={() => handleMarkPosted(r.id, false)}>
                            Undo
                          </button>
                        </>
                      ) : (
                        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} disabled={postingId === r.id} onClick={() => handleMarkPosted(r.id, true)}>
                          {postingId === r.id ? 'Saving...' : 'Mark as posted'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {r.status === 'pending' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleReviewAction(r.id, 'approve')}>Approve</button>
                    {rejectingId === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 220 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            value={rejectCategory} onChange={e => setRejectCategory(e.target.value)}
                            className="form-select" style={{ flex: 1, fontSize: 12, boxSizing: 'border-box' }}
                          >
                            <option value="">Select a reason...</option>
                            {REJECT_REASON_CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleReviewAction(r.id, 'reject')}>Send</button>
                        </div>
                        {rejectCategory === 'Other' && (
                          <input
                            type="text" placeholder="Comment (required, sent to WCM by email)"
                            value={rejectOtherComment} onChange={e => setRejectOtherComment(e.target.value)}
                            className="form-input" style={{ fontSize: 12, boxSizing: 'border-box' }}
                          />
                        )}
                      </div>
                    ) : (
                      <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleReviewAction(r.id, 'reject')}>Reject...</button>
                    )}
                  </div>
                )}
                {r.status === 'rejected' && r.rejection_reason && (
                  <div style={{ fontSize: 12, color: '#a13a2f', marginTop: 6, background: '#fbe9e7', padding: '6px 10px', borderRadius: 5 }}>
                    {r.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'admins' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Admins can approve/reject submissions and manage this list. Managers can approve/reject submissions but cannot manage Admins or Managers.
          </div>
          {adminNotice && <div style={{ fontSize: 12.5, marginBottom: 10, color: '#a13a2f' }}>{adminNotice}</div>}
          <div className="note-list" style={{ marginBottom: 14 }}>
            {admins.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{a.role}</div>
                </div>
                <button className="btn-outline" style={{ fontSize: 11, padding: '4px 8px' }} disabled={adminsLoading} onClick={() => handleRemoveAdmin(a.user_id)}>Remove</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email" placeholder="email@browardschools.com" value={newAdminEmail}
              onChange={e => setNewAdminEmail(e.target.value)} className="form-input" style={{ flex: 1, minWidth: 200, boxSizing: 'border-box' }}
            />
            <select value={newAdminRole} onChange={e => setNewAdminRole(e.target.value as 'admin' | 'manager')} className="form-select">
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary" disabled={adminsLoading} onClick={handleAddAdmin}>Add</button>
          </div>
        </div>
      )}

      {tab === 'wcms' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Give a school Web Content Manager access to Banner Submissions. They get an email with their own link to set a
            password, then sign in and submit banners for their school. Sending again to the same person re-sends the email.
          </div>
          {inviteNotice && (
            <div role="status" style={{ fontSize: 12.5, marginBottom: 10, color: inviteNotice.ok ? '#1e6b3a' : '#a13a2f' }}>{inviteNotice.text}</div>
          )}
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 8 }}>
            <input
              type="text" placeholder="Full name" value={inviteName} aria-label="WCM full name"
              onChange={e => setInviteName(e.target.value)} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <input
              type="email" placeholder="email@browardschools.com" value={inviteEmail} aria-label="WCM email"
              onChange={e => setInviteEmail(e.target.value)} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <select value={inviteLoc} onChange={e => setInviteLoc(e.target.value)} className="form-select" aria-label="School" style={{ width: '100%', boxSizing: 'border-box' }}>
              <option value="">{schoolsLoading ? 'Loading schools...' : 'Select a school...'}</option>
              {schools.map(s => (
                <option key={s.loc_no} value={s.loc_no}>{s.school_name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" disabled={inviteBusy} onClick={() => handleInviteWcm()} style={{ marginBottom: 16 }}>
            {inviteBusy ? 'Sending...' : 'Send invite'}
          </button>

          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>School WCMs on file ({schoolWcms.length})</div>
          <div className="note-list">
            {schoolWcms.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>None yet.</div>}
            {schoolWcms.map(w => (
              <div key={w.wcm_email + (w.school_location_nbr || '')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{w.wcm_name || w.wcm_email}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{w.wcm_email} · {w.name}</div>
                </div>
                {w.school_location_nbr && (
                  <button
                    className="btn-outline" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0 }} disabled={inviteBusy}
                    onClick={() => handleInviteWcm({ name: w.wcm_name || w.wcm_email, email: w.wcm_email, loc: w.school_location_nbr! })}
                  >
                    Resend
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
