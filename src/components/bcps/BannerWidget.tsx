'use client'

// WCM Banner Submission App widget.
// Built 2026-09-02 for Vanessa Deslandes / District Web Team, replacing the
// Power Apps mockup she originally shared (subscription-gated, not on our
// stack) with a widget on our own bcpsmarcomm.com WCM dashboard - per Sean:
// "The task is to use our own platform to create a tool... this could
// become a widget that we put inside of our BCPS MarCom."
//
// Scope confirmed via Sean + Vanessa Deslandes, 2026-08-24 through
// 2026-09-02: WCMs submit banner photos/videos to a review queue (never
// auto-published); a live preview shows the file composited into the actual
// banner + right-nav display so the WCM can self-check quality and whether
// the nav blocks faces; a 4-item requirement checklist (verbatim from the
// source mockup) must be acknowledged before submit; up to 3 submissions per
// request; a separate Request Removal flow lets a WCM ask to take down one
// of their own prior uploads; the District Web Team reviews everything
// (uploads + removals) in an internal queue, approves or rejects with a
// reason, and a rejection fires an automated templated email to the WCM.
// Admin/Manager permissions for this feature are self-contained
// (bcps_banner_admins) - Vanessa is the seeded Admin.

import { useEffect, useState } from 'react'
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

const CHECKLIST = [
  {
    key: 'media_release' as const,
    section: 'Approvals & Permissions',
    text: 'If this banner includes photos or videos of any identifiable student, I confirm a signed media release is on file for that student. This does not apply if no students appear in the submission.',
  },
  {
    key: 'no_overlays' as const,
    section: 'Photo Content Requirements',
    text: 'I understand that images cannot include graphics, borders, text overlays, logos, watermarks, or embedded announcements.',
  },
  {
    key: 'nav_visibility' as const,
    section: 'Photo Content Requirements',
    text: 'I understand that photos in which the homepage header or right-side navigation blocks faces will not be approved. I will ensure there is sufficient space on the right side of the image so that important subjects remain visible.',
  },
  {
    key: 'final_ack' as const,
    section: 'Final Acknowledgment',
    text: 'I have reviewed and understand all requirements. I acknowledge that submissions that do not meet these requirements will not be published.',
  },
]

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
  const [myRole, setMyRole] = useState<'admin' | 'manager' | null>(null)

  // ---- New Upload state ----
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileKind, setFileKind] = useState<'image' | 'video' | null>(null)
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
    if (!file) { setPreviewUrl(null); setFileKind(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setFileKind(file.type.startsWith('video') ? 'video' : 'image')
    return () => URL.revokeObjectURL(url)
  }, [file])

  const allChecked = CHECKLIST.every(c => checks[c.key])
  const canReview = myRole === 'admin' || myRole === 'manager'
  const isAdmin = myRole === 'admin'
  const myUploads = mine.filter(m => m.type === 'upload')

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
    if (!file) { setUploadNotice('Choose a photo or video first.'); return }
    if (!bannerTitle.trim()) { setUploadNotice('Banner type/title is required.'); return }
    if (!altText.trim()) { setUploadNotice('Alternative text is required.'); return }
    if (!allChecked) { setUploadNotice('All four requirement checkboxes must be checked before submitting.'); return }

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
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

            {/* Live preview: composites the file into the actual banner display,
                including the right-nav overlay, so a WCM can self-check quality,
                pixelation, absence of text/logos, and whether the nav blocks
                faces - per Vanessa Deslandes, 2026-08-24. */}
            {previewUrl && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 4 }}>Live preview</label>
                <div style={{
                  position: 'relative', width: '100%', maxWidth: 640, aspectRatio: '2880 / 1600',
                  background: '#000', overflow: 'hidden', borderRadius: 6, border: '1px solid var(--border)',
                }}>
                  {fileKind === 'video' ? (
                    <video src={previewUrl} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={previewUrl} alt="Banner preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <div style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0, width: '22%', minWidth: 120,
                    background: 'rgba(20,20,20,0.72)', display: 'flex', flexDirection: 'column',
                    justifyContent: 'center', gap: '6%', padding: '4% 5%',
                  }}>
                    {RIGHT_NAV_ITEMS.map(item => (
                      <div key={item} style={{ color: '#fff', fontSize: '2.6cqw', fontWeight: 600, lineHeight: 1.15, textAlign: 'right' }}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  This preview mirrors the real homepage banner and right-side navigation. Make sure faces and important subjects stay clear of the right-hand nav.
                </div>
              </div>
            )}

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

            <div style={{ background: 'var(--bg-page)', borderRadius: 6, padding: 12 }}>
              {['Approvals & Permissions', 'Photo Content Requirements', 'Final Acknowledgment'].map(section => (
                <div key={section} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{section}</div>
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

            {uploadNotice && <div style={{ fontSize: 12.5, color: uploadNotice.startsWith('Submitted') ? '#1e6b3a' : '#a13a2f' }}>{uploadNotice}</div>}

            <div>
              <button className="btn-primary" disabled={submitting} onClick={handleSubmitUpload}>
                {submitting ? 'Submitting...' : 'Submit for review'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Up to 3 submissions per request - submit this form again for additional banners.</div>
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
