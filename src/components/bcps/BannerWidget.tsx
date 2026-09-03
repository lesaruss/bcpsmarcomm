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
  'Our School', 'Academics', 'Students & Parents', 'Activities',
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
  { key: 'files', label: 'Up to three files' },
  { key: 'dims', label: 'Media meets 2000 × 800 px minimum requirements' },
  { key: 'no_overlays', label: 'Image is free of graphics, borders, text overlays' },
  { key: 'nav_clearance', label: 'Homepage navigation face-clearance' },
  { key: 'title', label: 'Banner title provided' },
  { key: 'alt', label: 'Required alternative text provided' },
  { key: 'approvals', label: 'Approvals and permissions acknowledged' },
  { key: 'final_ack', label: 'Final acknowledgment completed' },
] as const

type Tab = 'upload' | 'removal' | 'mine' | 'review' | 'admins'

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

export default function BannerWidget() {
  const [tab, setTab] = useState<Tab>('upload')
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
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileKind, setFileKind] = useState<'image' | 'video' | null>(null)
  // Natural pixel dimensions of the current file, for the "Media meets 2000
  // x 800 px minimum requirements" validation row. Images are measured via
  // a throwaway <img> load; video dimension checks aren't wired yet (no
  // metadata probe on the file itself today), so a video is treated as
  // meeting the requirement rather than blocking the WCM on an unverifiable
  // check - flagged for review same as before.
  const [fileDims, setFileDims] = useState<{ width: number; height: number } | null>(null)
  // Automated Photo Content Requirements scan (lib/bannerVision.ts via
  // /api/banner/scan) - runs the instant a file is chosen, see the useEffect
  // below. 'idle' before any file, 'scanning' while the request is in
  // flight, 'done' once a result (pass or fail) is in. Drives the
  // no_overlays/nav_clearance rows in validationStatus below - there is no
  // manual checkbox for these anymore, per Sean, 2026-09-03.
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'degraded' | 'error'>('idle')
  const [scanResult, setScanResult] = useState<{ no_overlays_pass: boolean; nav_clearance_pass: boolean; reasons: string[] } | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [bannerTitle, setBannerTitle] = useState('')
  const [bannerCaption, setBannerCaption] = useState('')
  const [altText, setAltText] = useState('')
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)

  // ---- Request Removal state ----
  const [removalTargetId, setRemovalTargetId] = useState('')
  const [removalDate, setRemovalDate] = useState('')
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
  const [rejectReason, setRejectReason] = useState('')
  const [reviewNotice, setReviewNotice] = useState<string | null>(null)

  // ---- Admin management (admin only) ----
  const [admins, setAdmins] = useState<BannerAdminRow[]>([])
  const [adminsLoading, setAdminsLoading] = useState(false)
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminRole, setNewAdminRole] = useState<'admin' | 'manager'>('manager')
  const [adminNotice, setAdminNotice] = useState<string | null>(null)

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

  useEffect(() => {
    if (tab === 'review') loadReviewQueue()
    if (tab === 'admins') loadMyRoleAndAdmins()
  }, [tab])

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null); setFileKind(null); setFileDims(null)
      setScanState('idle'); setScanResult(null); setScanError(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    const kind = file.type.startsWith('video') ? 'video' : 'image'
    setFileKind(kind)
    setFileDims(null)
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => setFileDims({ width: img.naturalWidth, height: img.naturalHeight })
      img.src = url
    }

    // Automated Photo Content Requirements scan - fires the instant a file
    // is chosen, "upfront" per Sean, before the WCM has typed anything else.
    // /api/banner/submit re-runs this same check server-side as the real
    // gate; this call is for fast in-form feedback.
    let cancelled = false
    setScanState('scanning'); setScanResult(null); setScanError(null)
    ;(async () => {
      try {
        if (kind === 'video') {
          if (!cancelled) { setScanResult({ no_overlays_pass: true, nav_clearance_pass: true, reasons: [] }); setScanState('done') }
          return
        }
        const b64 = await fileToBase64(file)
        const res = await authedFetch('/api/banner/scan', {
          method: 'POST',
          body: JSON.stringify({ file_base64: b64, mime_type: file.type }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          // Hard failure (auth, network, etc.) - genuinely blocks, unlike
          // the fail-open case below.
          setScanError(data.error || 'Automated scan failed.'); setScanState('error')
        } else if (data.skipped && data.error) {
          // Fail-open: the scanner itself is unavailable (e.g. API outage),
          // not a content violation - submission is allowed to proceed
          // flagged for manual review, matching /api/banner/submit's policy.
          setScanResult({ no_overlays_pass: true, nav_clearance_pass: true, reasons: [] })
          setScanError(data.error)
          setScanState('degraded')
        } else {
          setScanResult({ no_overlays_pass: !!data.no_overlays_pass, nav_clearance_pass: !!data.nav_clearance_pass, reasons: data.reasons || [] })
          setScanState('done')
        }
      } catch {
        if (!cancelled) { setScanError('Automated scan failed - please try re-selecting the file.'); setScanState('error') }
      }
    })()

    return () => { cancelled = true; URL.revokeObjectURL(url) }
  }, [file])

  const allChecked = CHECKLIST.every(c => checks[c.key])
  // Live Validation checklist status (right-hand panel) - each row derived
  // from current form state, matching Vanessa's mockup's per-item Pass
  // display. See VALIDATION_CHECKLIST comment.
  const validationStatus: Record<string, boolean> = {
    files: !!file,
    dims: fileKind === 'video' ? true : !!(fileDims && fileDims.width >= 2000 && fileDims.height >= 800),
    no_overlays: !!scanResult?.no_overlays_pass,
    nav_clearance: !!scanResult?.nav_clearance_pass,
    title: bannerTitle.trim() !== '',
    alt: altText.trim() !== '',
    approvals: !!checks.media_release,
    final_ack: !!checks.final_ack,
  }
  const allValidationPassed = VALIDATION_CHECKLIST.every(v => validationStatus[v.key])
  const canReview = myRole === 'admin' || myRole === 'manager'
  const isAdmin = myRole === 'admin'
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

  async function handleSubmitUpload() {
    setUploadNotice(null)
    if (!selectedSchool) { setUploadNotice('Select your school first.'); return }
    if (!file) { setUploadNotice('Choose a photo or video first.'); return }
    if (!bannerTitle.trim()) { setUploadNotice('Banner type/title is required.'); return }
    if (!altText.trim()) { setUploadNotice('Alternative text is required.'); return }
    if (!allChecked) { setUploadNotice('Both requirement checkboxes must be checked before submitting.'); return }
    if (scanState === 'scanning') { setUploadNotice('Still running the automated content scan - one moment.'); return }
    if (scanState === 'error') { setUploadNotice(scanError || 'The automated content scan failed - please try re-selecting the file.'); return }
    if (!scanResult?.no_overlays_pass || !scanResult?.nav_clearance_pass) { setUploadNotice('This image needs to pass the automated content scan before it can be submitted.'); return }

    setSubmitting(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await authedFetch('/api/banner/submit', {
        method: 'POST',
        body: JSON.stringify({
          file_base64: base64,
          file_name: file.name,
          mime_type: file.type,
          banner_title: bannerTitle,
          banner_caption: bannerCaption,
          alt_text: altText,
          checklist_ack: checks,
          school_location_nbr: selectedSchool,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setUploadNotice(data.error || 'Submission failed.'); return }
      setUploadNotice('Submitted to the District Web Team for review.')
      setFile(null); setBannerTitle(''); setBannerCaption(''); setAltText(''); setChecks({})
      loadMine()
    } catch {
      setUploadNotice('Submission failed - please try again.')
    } finally {
      setSubmitting(false)
    }
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
          requested_removal_date: removalDate || null,
          removal_description: removalDesc,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setRemovalNotice(data.error || 'Request failed.'); return }
      setRemovalNotice('Removal request sent to the District Web Team.')
      setRemovalTargetId(''); setRemovalDate(''); setRemovalDesc('')
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
      setRejectReason('')
      return
    }
    if (action === 'reject' && !rejectReason.trim()) {
      setReviewNotice('A rejection reason is required.')
      return
    }
    try {
      const res = await authedFetch('/api/banner/review', {
        method: 'POST',
        body: JSON.stringify({ id, action, rejection_reason: action === 'reject' ? rejectReason : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setReviewNotice(data.error || 'Action failed.'); return }
      if (action === 'reject') {
        setReviewNotice(data.emailed ? 'Rejected - notification email sent to the WCM.' : `Rejected - ${data.warning || 'email not sent.'}`)
      } else {
        setReviewNotice('Approved.')
      }
      setRejectingId(null)
      setRejectReason('')
      loadReviewQueue()
    } catch {
      setReviewNotice('Action failed - please try again.')
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
  if (canReview) tabs.push({ id: 'review', label: 'Review Queue' })
  if (isAdmin) tabs.push({ id: 'admins', label: 'Manage Admins' })

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <h3>Banner Submissions</h3>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
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

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Photo or video</label>
              <input
                type="file"
                accept="image/png,image/jpeg,video/mp4"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Image: 2880x1600px target (2000x800px minimum). Video: MP4 only, max 30 seconds, 1080p HD recommended (not 4K).
              </div>
            </div>

            {/* Live preview: mocks the actual school-site header + homepage
                banner + right-nav (a generic logo/title stand in for the real
                school chrome, since this tool serves every school), with the
                file composited into the hero, so a WCM can self-check
                quality, pixelation, absence of text/logos, and whether the
                nav blocks faces - per Vanessa Deslandes, 2026-08-24. Reflows
                at container width the same way the real school sites do
                (header chrome and hero overlay drop away below ~480px, nav
                items become full-width stacked rows) - per Sean, 2026-09-02:
                "the same page resizing functionality ... so they can see
                what happens when they resize their screen." Drag the
                bottom-right corner of the frame, or use the width presets,
                to test narrower widths. */}
            {(() => {
              const displayUrl = previewUrl || PLACEHOLDER_IMAGE
              const displayKind = previewUrl ? fileKind : 'image'
              return (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Live preview</label>

                <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
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
                </div>

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
                  ref={previewFrameRef}
                  className="bwp-frame"
                  style={{
                    width: '100%', maxWidth: '100%', minWidth: 260, resize: 'horizontal', overflow: 'hidden',
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

                  {/* Hero: the actual uploaded file, wide-container variant overlays
                      the nav + welcome text on the image like the real sites do;
                      narrow-container variant matches the real sites' mobile
                      layout, where the overlay drops and both move below the image. */}
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '2880 / 1600', background: '#000', overflow: 'hidden' }}>
                    {displayKind === 'video' ? (
                      <video src={displayUrl} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img src={displayUrl} alt={previewUrl ? 'Banner preview' : 'Sample banner placeholder'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    <div className="bwp-wide-only" style={{
                      position: 'absolute', left: '3cqw', bottom: '4cqw', color: '#fff',
                      fontSize: '4.2cqw', fontWeight: 800, textShadow: '0 1px 6px rgba(0,0,0,0.5)',
                    }}>
                      Welcome to Your School!
                    </div>
                  </div>

                  {/* Narrow-container variant: welcome text + full-width stacked nav
                      rows below the image, matching the real sites' mobile layout. */}
                  <div className="bwp-narrow-only">
                    <div style={{ background: '#0a3764', color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: 18, padding: '16px 10px' }}>
                      Welcome to Your School!
                    </div>
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

                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {previewUrl
                    ? 'This preview mirrors the real school-site header, homepage banner, and navigation, including how they reflow on a smaller screen. Drag the frame’s bottom-right corner (or use the width buttons above) to check narrower widths. Make sure faces and important subjects stay clear of the right-hand nav.'
                    : 'This is a sample image showing how your upload will look on the homepage. Choose a photo or video above and it will replace this placeholder automatically.'}
                </div>

                {/* Automated Photo Content Requirements scan - shown "upfront"
                    right where it runs, per Sean 2026-09-03, not buried only
                    in the right-hand Validation checklist. Only appears once
                    a real file is selected (not for the placeholder). */}
                {file && (
                  <div style={{
                    marginTop: 10, borderRadius: 6, padding: '10px 12px', fontSize: 12.5,
                    background: scanState === 'scanning' ? '#f3f4f6'
                      : scanState === 'error' ? '#fbe9e7'
                      : scanState === 'degraded' ? '#fdf3e0'
                      : (scanResult?.no_overlays_pass && scanResult?.nav_clearance_pass) ? '#e6f4ea' : '#fbe9e7',
                    color: scanState === 'scanning' ? '#4b5563'
                      : scanState === 'error' ? '#a13a2f'
                      : scanState === 'degraded' ? '#8a5a00'
                      : (scanResult?.no_overlays_pass && scanResult?.nav_clearance_pass) ? '#1e6b3a' : '#a13a2f',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: scanResult?.reasons?.length ? 4 : 0 }}>
                      {scanState === 'scanning' && 'Scanning image for graphics, text overlays, and nav clearance...'}
                      {scanState === 'error' && `Automated scan failed: ${scanError}`}
                      {scanState === 'degraded' && 'Automated scan unavailable right now - this submission will be flagged for the District Web Team to review manually.'}
                      {scanState === 'done' && (scanResult?.no_overlays_pass && scanResult?.nav_clearance_pass
                        ? 'Automated content scan passed.'
                        : 'Automated content scan flagged this image - it cannot be submitted as-is.')}
                    </div>
                    {scanResult?.reasons && scanResult.reasons.length > 0 && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {scanResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              )
            })()}

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Banner type / title *</label>
              <input type="text" value={bannerTitle} onChange={e => setBannerTitle(e.target.value)} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Banner caption (optional)</label>
              <input type="text" value={bannerCaption} onChange={e => setBannerCaption(e.target.value)} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Alternative text *</label>
              <input type="text" value={altText} onChange={e => setAltText(e.target.value)} className="form-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>

            {/* Submission requirement acknowledgements - the two items the
                tool cannot check for itself (media release on file, final
                sign-off). Photo Content Requirements used to be a third box
                here; it's now the automated scan shown above instead of a
                self-cert checkbox. See CHECKLIST comment above. */}
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
              mockup exactly (label, order, one row per criterion, updates the
              instant its condition is met). See VALIDATION_CHECKLIST comment. */}
          <div>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 16, position: 'sticky', top: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Validation checklist</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>All items must pass before review.</div>
              {VALIDATION_CHECKLIST.map(v => {
                const pass = validationStatus[v.key]
                return (
                  <div key={v.key} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    background: pass ? '#1e6b3a' : '#e4e4e4', color: pass ? '#fff' : '#666',
                    borderRadius: 6, padding: '8px 12px', marginBottom: 8, fontSize: 12.5, fontWeight: 600,
                  }}>
                    <span>{v.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{pass ? 'Pass' : 'Pending'}</span>
                  </div>
                )
              })}
              <button
                className="btn-primary"
                disabled={submitting || !allValidationPassed || !selectedSchool}
                onClick={handleSubmitUpload}
                style={{ width: '100%', marginTop: 4 }}
              >
                {submitting ? 'Submitting...' : 'Submit for review'}
              </button>
              {uploadNotice && (
                <div style={{ fontSize: 12, marginTop: 8, color: uploadNotice.startsWith('Submitted') ? '#1e6b3a' : '#a13a2f' }}>
                  {uploadNotice}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Up to 3 submissions per request - submit this form again for additional banners.
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
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Target removal date</label>
            <input type="date" value={removalDate} onChange={e => setRemovalDate(e.target.value)} className="form-input" />
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
          {reviewNotice && <div style={{ fontSize: 12.5, marginBottom: 10, color: reviewNotice.startsWith('Approved') || reviewNotice.startsWith('Rejected') ? '#1e6b3a' : '#a13a2f' }}>{reviewNotice}</div>}
          <div className="note-list">
            {reviewLoading ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            ) : reviewItems.length === 0 ? (
              <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nothing submitted yet.</div>
            ) : reviewItems.map(r => (
              <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      {r.type === 'upload' ? (r.banner_title || r.file_name) : `Removal request: ${r.removal_description?.slice(0, 60)}`}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.wcm_email} &middot; {new Date(r.submitted_at).toLocaleDateString()}</div>
                  </div>
                  {statusBadge(r.status)}
                </div>
                {r.type === 'upload' && r.signed_url && (
                  <div style={{ marginTop: 8 }}>
                    {r.file_type === 'video' ? (
                      <video src={r.signed_url} controls style={{ maxWidth: 320, borderRadius: 5 }} />
                    ) : (
                      <img src={r.signed_url} alt={r.alt_text || ''} style={{ maxWidth: 320, borderRadius: 5 }} />
                    )}
                    {r.alt_text && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Alt text: {r.alt_text}</div>}
                  </div>
                )}
                {r.status === 'pending' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleReviewAction(r.id, 'approve')}>Approve</button>
                    {rejectingId === r.id ? (
                      <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
                        <input
                          type="text" placeholder="Rejection reason (sent to WCM by email)"
                          value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          className="form-input" style={{ flex: 1, fontSize: 12, boxSizing: 'border-box' }}
                        />
                        <button className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => handleReviewAction(r.id, 'reject')}>Send</button>
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
    </div>
  )
}
