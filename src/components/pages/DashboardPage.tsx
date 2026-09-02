'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { PageId } from '@/lib/types'
import { MEMBERS } from '@/lib/data'
import { useBCPSShell } from '@/components/BCPSShell'
import { getTotalPages } from '@/lib/cert-data'
import { SAMPLE_ROLE_MEMBERS } from '@/components/Sidebar'

interface DashboardPageProps {
  onNavigate: (page: PageId) => void
  viewAsUserId?: string
}

const STAT_CARDS = [
  { label: 'Active Members', value: '24', delta: '+3 this month', positive: true },
  { label: 'Notes Published', value: '142', delta: '+18 this week', positive: true },
  { label: 'Dept. Pages Live', value: '6', delta: '6 pending', positive: false },
  { label: 'Avg. Engagement', value: '68%', delta: '+5% vs last month', positive: true },
]

// Flat SVG icons for quick actions and consoles
const FlatIcons = {
  note: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  building: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  chart: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
      <line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  megaphone: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  ),
  clock: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  globe: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
}

// Convert slug like "automate-rejected-banners" -> "Automate Rejected Banners"
function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Format relative time
function relativeTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffH / 24)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface AssignmentNote {
  id: string
  assignment_slug: string
  note_text: string
  author: string
  created_at: string
}

interface SiteMessage {
  id: string
  created_at: string
  email: string | null
  page: string | null
  message: string
  status: string
  read_at: string | null
  admin_reply: string | null
  admin_reply_audio_url: string | null
  replied_at: string | null
  notify_error: string | null
  user_id: string | null
}

interface DeptDetail {
  slug: string
  name: string
  division: string | null
  director_name: string | null
  director_email: string | null
  chief_title: string | null
  chief_name: string | null
  wcm_name: string | null
  wcm_email: string | null
  audit_status: string | null
  ada_score: number | null
  health_status: string | null
  blurb: string | null
  website_url: string | null
  audit_date: string | null
  current_round: number | null
}

interface CatalogDoc {
  id: string
  slug: string
  title: string
  description: string | null
  type: string | null
  date: string | null
  date_sort: string | null
  section: 'documents' | 'meeting-notes' | 'records'
  doc_url: string
  featured: boolean
  series_title: string | null
}

// Daily-use tool launchers, per Sean 2026-08-27: exactly three for now,
// more to come later. Finalsite CMS URL confirmed via canon
// (bcps-two-distinct-wcm-systems) - browardschools.com/admin is the
// district's real live CMS, separate login/AD SSO from bcpsmarcomm.com.
// Hot Lab has no standing Teams join link on file anywhere in this repo or
// canon (it's a recurring live call, not a static URL) - links to the
// in-portal Hot Lab meeting notes/series instead until Sean supplies a
// real join link.
const TOOL_TILES = [
  { key: 'finalsite', name: 'Finalsite CMS', desc: 'Edit your live department page', icon: 'FS', href: 'https://browardschools.com/admin', external: true },
  { key: 'hotlab', name: 'Hot Lab', desc: 'Live group call on Teams - we solve issues and walk through updates', icon: 'HL', page: 'notes' as PageId },
  { key: 'wcmhub', name: 'WCM Hub', desc: 'Your home base on bcpsmarcomm.com', icon: 'WH', page: 'wcm' as PageId },
]

// Draggable / resizable dashboard grid (Sean, 2026-08-29): every widget on
// this page lives in one continuous grid, in an order and span (1 = half
// width, 2 = full width) each signed-in member can rearrange to their own
// liking via "Customize layout". Saved to localStorage per browser - a
// lightweight, no-schema-change way to remember one person's layout
// preference without a new database table or per-user architecture
// decision. The reference-tile group (Team / My Department / Quick Actions
// / Consoles) is a single locked unit per Sean's spec - it always moves and
// resizes together, collapsing from a 2x2 grid to two stacked rows of 2
// when placed in a half-width slot. Matches the approved mockup
// (2026-08-29, "Flexible Dashboard Grid" artifact).
type DashSpan = 1 | 2
interface DashLayoutItem { id: string; span: DashSpan }
const DASH_LAYOUT_STORAGE_KEY = 'bcps-dashboard-layout-v1'
const DEFAULT_DASH_LAYOUT: DashLayoutItem[] = [
  { id: 'cert', span: 2 },
  { id: 'stats', span: 2 },
  { id: 'messages', span: 2 },
  { id: 'tools', span: 1 },
  { id: 'audit', span: 1 },
  { id: 'meetingnotes', span: 1 },
  { id: 'documents', span: 1 },
  { id: 'accessrequests', span: 2 },
  { id: 'recentnotes', span: 1 },
  { id: 'refgroup', span: 2 },
  { id: 'profile', span: 2 },
]

// Fictitious "preview a role" identities (Sean, 2026-08-27): purely to let a
// SuperAdmin confirm the new dashboard layout renders correctly for each
// access tier, never tied to a real person's account. These ids never match
// anything in the live /api/bcps/members or bcps_departments data, so every
// section below that would normally fetch live data is substituted with
// fully-synthetic, clearly-labeled sample content instead.
const SAMPLE_IDS = new Set(SAMPLE_ROLE_MEMBERS.map(m => m.id))

const SAMPLE_DEPT_DETAIL: Record<string, DeptDetail> = {
  SWC: {
    slug: 'sample-department', name: 'Sample Department (Preview)', division: 'Sample Division',
    director_name: 'Jordan Rivera', director_email: 'sample.director@browardschools.com',
    chief_title: 'Chief Officer', chief_name: 'Alex Chen',
    wcm_name: 'Wendy Ramirez', wcm_email: 'sample-wcm@preview.local',
    audit_status: 'in_progress', ada_score: 82, health_status: 'good',
    blurb: 'This is sample preview data shown for layout verification only - it is not a real department record.',
    website_url: 'https://browardschools.com/o/sample-department', audit_date: new Date().toISOString(), current_round: 2,
  },
  SDW: {
    slug: 'sample-department', name: 'Sample Department (Preview)', division: 'Sample Division',
    director_name: 'Jordan Rivera', director_email: 'sample.director@browardschools.com',
    chief_title: 'Chief Officer', chief_name: 'Alex Chen',
    wcm_name: 'Dana Okafor', wcm_email: 'sample-dwt@preview.local',
    audit_status: 'complete', ada_score: 94, health_status: 'excellent',
    blurb: 'This is sample preview data shown for layout verification only - it is not a real department record.',
    website_url: 'https://browardschools.com/o/sample-department', audit_date: new Date().toISOString(), current_round: 3,
  },
  SSA: {
    slug: 'sample-department', name: 'Sample Department (Preview)', division: 'District Web Team',
    director_name: 'Jordan Rivera', director_email: 'sample.director@browardschools.com',
    chief_title: 'Chief Officer', chief_name: 'Alex Chen',
    wcm_name: 'Sam Rivera', wcm_email: 'sample-superadmin@preview.local',
    audit_status: 'complete', ada_score: 97, health_status: 'excellent',
    blurb: 'This is sample preview data shown for layout verification only - it is not a real department record.',
    website_url: 'https://browardschools.com/o/sample-department', audit_date: new Date().toISOString(), current_round: 4,
  },
}

function sampleDoc(id: string, title: string, section: CatalogDoc['section'], daysAgo: number, featured: boolean, type: string): CatalogDoc {
  const d = new Date(Date.now() - daysAgo * 86400000)
  const iso = d.toISOString()
  return {
    id, slug: id, title, description: 'Sample preview content for layout verification.',
    type, date: iso, date_sort: iso, section, doc_url: '#', featured, series_title: 'Sample Playbook',
  }
}

const SAMPLE_MEETING_NOTES: Record<string, CatalogDoc[]> = {
  SWC: [
    sampleDoc('sample-mn-1', 'Hot Lab Recap - Sample Week', 'meeting-notes', 2, false, 'Meeting Note'),
    sampleDoc('sample-mn-2', 'District Web Team Huddle - Sample', 'meeting-notes', 6, false, 'Meeting Note'),
    sampleDoc('sample-mn-3', 'Department WCM Check-in - Sample', 'meeting-notes', 10, false, 'Meeting Note'),
  ],
  SDW: [
    sampleDoc('sample-mn-4', 'District Web Team Huddle - Sample', 'meeting-notes', 1, false, 'Meeting Note'),
    sampleDoc('sample-mn-5', 'Hot Lab Recap - Sample Week', 'meeting-notes', 5, false, 'Meeting Note'),
    sampleDoc('sample-mn-6', 'Cross-Department Sync - Sample', 'meeting-notes', 9, false, 'Meeting Note'),
  ],
  SSA: [
    sampleDoc('sample-mn-7', 'SuperAdmin Governance Review - Sample', 'meeting-notes', 1, false, 'Meeting Note'),
    sampleDoc('sample-mn-8', 'District Web Team Huddle - Sample', 'meeting-notes', 4, false, 'Meeting Note'),
    sampleDoc('sample-mn-9', 'Hot Lab Recap - Sample Week', 'meeting-notes', 8, false, 'Meeting Note'),
  ],
}

const SAMPLE_DOCUMENTS: Record<string, CatalogDoc[]> = {
  SWC: [
    sampleDoc('sample-doc-1', 'WCM Hub Style Guide - Sample', 'documents', 3, true, 'Website'),
    sampleDoc('sample-doc-2', 'Page Audit Checklist - Sample', 'documents', 7, false, 'Report'),
    sampleDoc('sample-doc-3', 'ADA Quick Reference - Sample', 'documents', 12, false, 'Guide'),
  ],
  SDW: [
    sampleDoc('sample-doc-4', 'District Web Team Playbook - Sample', 'documents', 2, true, 'Website'),
    sampleDoc('sample-doc-5', 'Departmental Rollout Plan - Sample', 'documents', 8, false, 'Report'),
    sampleDoc('sample-doc-6', 'ADA Quick Reference - Sample', 'documents', 14, false, 'Guide'),
  ],
  SSA: [
    sampleDoc('sample-doc-7', 'District-Wide Audit Summary - Sample', 'documents', 1, true, 'Report'),
    sampleDoc('sample-doc-8', 'SuperAdmin Console Guide - Sample', 'documents', 6, false, 'Guide'),
    sampleDoc('sample-doc-9', 'ADA Quick Reference - Sample', 'documents', 15, false, 'Guide'),
  ],
}

export default function DashboardPage({ onNavigate, viewAsUserId }: DashboardPageProps) {
  const [notes, setNotes] = useState<AssignmentNote[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [certProgress, setCertProgress] = useState<{ pct: number; completed: number; total: number; allDone: boolean; hasAnyProgress: boolean } | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [openNote, setOpenNote] = useState<AssignmentNote | null>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; name: string; initials: string; color: string; role: string; department: { slug: string; name: string; division: string | null } | null }>>([])
  const [meId, setMeId] = useState<string | null>(null)
  const router = useRouter()

  const { canManageMessages } = useBCPSShell()
  const [messages, setMessages] = useState<SiteMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(true)
  const [openMessage, setOpenMessage] = useState<SiteMessage | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)
  const [replyNotice, setReplyNotice] = useState<string | null>(null)
  const [accessRequesting, setAccessRequesting] = useState(false)
  const [accessNotice, setAccessNotice] = useState<string | null>(null)
  const [accessRequests, setAccessRequests] = useState<Array<{ id: string; target_name: string; status: string; requested_at: string; approved_at: string | null }>>([])

  // Dashboard grid layout (order + span per widget), per Sean 2026-08-29.
  // Loaded from localStorage on mount; a device that never customized just
  // keeps the shipped default order/spans.
  const [dashLayout, setDashLayout] = useState<DashLayoutItem[]>(DEFAULT_DASH_LAYOUT)
  const [customizingLayout, setCustomizingLayout] = useState(false)
  const [dragCellId, setDragCellId] = useState<string | null>(null)
  const [dragOverCellId, setDragOverCellId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASH_LAYOUT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const knownIds = new Set(DEFAULT_DASH_LAYOUT.map(w => w.id))
      const cleaned: DashLayoutItem[] = parsed.filter((w: any) => w && knownIds.has(w.id) && (w.span === 1 || w.span === 2))
      // Any widget added to DEFAULT_DASH_LAYOUT after this browser last
      // saved a layout (a future new tile) is appended at the end so it
      // still shows up instead of silently disappearing.
      const missing = DEFAULT_DASH_LAYOUT.filter(d => !cleaned.some(c => c.id === d.id))
      setDashLayout([...cleaned, ...missing])
    } catch {
      // Best-effort only - a corrupt or blocked localStorage just falls
      // back to the shipped default layout.
    }
  }, [])

  function persistDashLayout(next: DashLayoutItem[]) {
    setDashLayout(next)
    try { window.localStorage.setItem(DASH_LAYOUT_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  function moveDashCell(fromId: string, toId: string) {
    if (fromId === toId) return
    const arr = [...dashLayout]
    const from = arr.findIndex(w => w.id === fromId)
    const to = arr.findIndex(w => w.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    persistDashLayout(arr)
  }

  function setDashCellSpan(id: string, span: DashSpan) {
    persistDashLayout(dashLayout.map(w => (w.id === id ? { ...w, span } : w)))
  }

  function resetDashLayout() {
    persistDashLayout(DEFAULT_DASH_LAYOUT)
  }

  function spanOfDashCell(id: string): DashSpan {
    return dashLayout.find(w => w.id === id)?.span ?? 1
  }

  // Wraps one widget's existing content in the draggable/resizable cell -
  // only interactive (draggable, showing the grip + span toggle) while
  // "Customize layout" is on, so normal day-to-day use of the dashboard
  // stays exactly as before.
  function dashCell(id: string, node: React.ReactNode) {
    const span = spanOfDashCell(id)
    const classes = [
      'dash-cell',
      span === 2 ? 'span-2' : '',
      customizingLayout ? 'customizing' : '',
      dragOverCellId === id ? 'drag-over' : '',
      dragCellId === id ? 'dragging' : '',
    ].filter(Boolean).join(' ')
    return (
      <div
        key={id}
        className={classes}
        draggable={customizingLayout}
        onDragStart={customizingLayout ? (e) => { setDragCellId(id); e.dataTransfer.effectAllowed = 'move' } : undefined}
        onDragEnd={customizingLayout ? () => { setDragCellId(null); setDragOverCellId(null) } : undefined}
        onDragOver={customizingLayout ? (e) => { if (dragCellId && dragCellId !== id) { e.preventDefault(); setDragOverCellId(id) } } : undefined}
        onDragLeave={customizingLayout ? () => setDragOverCellId(prev => (prev === id ? null : prev)) : undefined}
        onDrop={customizingLayout ? (e) => { e.preventDefault(); if (dragCellId) moveDashCell(dragCellId, id); setDragCellId(null); setDragOverCellId(null) } : undefined}
      >
        {customizingLayout && (
          <div className="dash-cell-controls">
            <span className="dash-cell-grip" title="Drag to reorder">&#8942;&#8942;</span>
            <div className="dash-span-toggle">
              <button type="button" className={span === 1 ? 'active' : ''} onClick={() => setDashCellSpan(id, 1)}>1</button>
              <button type="button" className={span === 2 ? 'active' : ''} onClick={() => setDashCellSpan(id, 2)}>2</button>
            </div>
          </div>
        )}
        {node}
      </div>
    )
  }

  // New dashboard tiles, per Sean 2026-08-27: department profile (bottom,
  // click name), daily-use tools, page audit, meeting notes, documents.
  const [deptDetail, setDeptDetail] = useState<DeptDetail | null>(null)
  const [deptDetailLoading, setDeptDetailLoading] = useState(true)
  const [docs, setDocs] = useState<CatalogDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docMode, setDocMode] = useState<'newest' | 'favorites'>('newest')
  const profileRef = useRef<HTMLDivElement | null>(null)

  // Voice input for replies (per Sean, 2026-07-29): admins are trusted
  // professionals, so unlike GeekFon's Passport/Plus dictate-vs-record
  // tier gate, both tools are just offered outright, no gate at all.
  const [dictating, setDictating] = useState(false)
  const [recording, setRecording] = useState(false)
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const dictationBaseRef = useRef('')
  const finalTranscriptRef = useRef('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      const r = await fetch('/api/bcps/members', { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) { const j = await r.json(); setTeamMembers(j.members); setMeId(j.me) }
    })()
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('wcm_cert_users')
        .select('full_name')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          const name = data?.full_name || user.email?.split('@')[0] || null
          setUserName(name ? name.split(' ')[0] : null)
        })
      supabase
        .from('wcm_cert_progress')
        .select('completed,last_visited_at')
        .eq('user_id', user.id)
        .eq('course_id', 'dept-wcm-v1')
        .then(({ data }) => {
          if (!data) return
          const completed = data.filter((r: { completed: boolean }) => r.completed).length
          // Was hardcoded to 89, a stale count left over from before the
          // course content was trimmed - real total lives in cert-data.ts
          // and drifts whenever modules/pages are added or removed. The
          // stale number meant this widget could never show 100% even
          // after a WCM finished every real page, and kept sending them
          // back into a course that had nothing left to do (Kristin
          // Kupetsky, 2026-08-20).
          const total = getTotalPages()
          const pct = Math.round((completed / total) * 100)
          // hasAnyProgress: any row at all (even just last_visited_at, no
          // Mark Complete yet) means Save & Exit has already tracked a real
          // position for this user. completed===0 alone is not "never
          // started" - a WCM who saved & exited mid-module without hitting
          // Mark Complete on a single page still has completed===0 but a
          // real last_visited_at position, and must never be sent back to
          // /welcome -> Module 1 Page 1. Found live 2026-07-28 (Hot Lab,
          // Celia Jimenez): this exact case restarted her from scratch.
          setCertProgress({ pct, completed, total, allDone: completed >= total, hasAnyProgress: data.length > 0 })
        })
    })
  }, [viewAsUserId])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('bcps_assignment_notes')
      .select('id, assignment_slug, note_text, author, created_at')
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        setNotes(data ?? [])
        setNotesLoading(false)
      })
  }, [viewAsUserId])

  async function loadMessages() {
    if (!canManageMessages) { setMessagesLoading(false); return }
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { setMessagesLoading(false); return }
    const r = await fetch('/api/bcps/messages', { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) {
      const j = await r.json()
      setMessages(j.messages ?? [])
    }
    setMessagesLoading(false)
  }

  useEffect(() => { loadMessages() }, [canManageMessages])

  async function loadAccessRequests() {
    if (!canManageMessages) return
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    const r = await fetch('/api/bcps/access-requests', { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) {
      const j = await r.json()
      setAccessRequests(j.requests ?? [])
    }
  }

  useEffect(() => { loadAccessRequests() }, [canManageMessages])

  // My Department's full profile + audit standing, for the Page Audit tile
  // and the Department Profile card at the bottom of the page. Waits on
  // teamMembers (already fetched above) to resolve the department slug,
  // same source the existing "My Department" quick tile uses.
  const isSampleView = !!viewAsUserId && SAMPLE_IDS.has(viewAsUserId)

  const myDeptSlug = isSampleView
    ? SAMPLE_DEPT_DETAIL[viewAsUserId!].slug
    : (viewAsUserId
      ? teamMembers.find(m => m.initials === viewAsUserId)?.department?.slug
      : teamMembers.find(m => m.user_id === meId)?.department?.slug) ?? null

  // Sample identities are never real people/departments - substitute fully
  // synthetic data instead of hitting bcps_departments with a slug that
  // will never exist.
  useEffect(() => {
    if (isSampleView) { setDeptDetail(SAMPLE_DEPT_DETAIL[viewAsUserId!]); setDeptDetailLoading(false); return }
    if (!myDeptSlug) { setDeptDetail(null); setDeptDetailLoading(false); return }
    setDeptDetailLoading(true)
    const supabase = createClient()
    supabase
      .from('bcps_departments')
      .select('slug, name, division, director_name, director_email, chief_title, chief_name, wcm_name, wcm_email, audit_status, ada_score, health_status, blurb, website_url, audit_date, current_round')
      .eq('slug', myDeptSlug)
      .maybeSingle()
      .then(({ data }) => {
        setDeptDetail(data ?? null)
        setDeptDetailLoading(false)
      })
  }, [myDeptSlug, isSampleView, viewAsUserId])

  // Documents + Meeting Notes tiles both read the same access-filtered
  // catalog NotesPage/DocumentsPage already use (/api/bcps/documents),
  // split client-side by section - no new endpoint needed.
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) { setDocsLoading(false); return }
      const r = await fetch('/api/bcps/documents', { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const j = await r.json()
        setDocs(j.documents ?? [])
      }
      setDocsLoading(false)
    })()
  }, [])

  const meetingNotes = isSampleView
    ? SAMPLE_MEETING_NOTES[viewAsUserId!]
    : docs
      .filter(d => d.section === 'meeting-notes')
      .sort((a, b) => (b.date_sort || '').localeCompare(a.date_sort || ''))
      .slice(0, 3)

  const documentsList = isSampleView
    ? (docMode === 'favorites'
      ? SAMPLE_DOCUMENTS[viewAsUserId!].filter(d => d.featured)
      : SAMPLE_DOCUMENTS[viewAsUserId!])
    : (docMode === 'favorites'
      ? docs.filter(d => d.section === 'documents' && d.featured)
      : docs.filter(d => d.section === 'documents').sort((a, b) => (b.date_sort || '').localeCompare(a.date_sort || ''))
    ).slice(0, 5)

  function scrollToProfile() {
    profileRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function openAndMarkRead(msg: SiteMessage) {
    setOpenMessage(msg)
    setReplyText('')
    setReplyNotice(null)
    setAccessNotice(null)
    if (!msg.read_at) {
      const supabase = createClient()
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      await fetch('/api/bcps/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: msg.id, action: 'read' }),
      })
      loadMessages()
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function sendReply() {
    if (!openMessage || (!replyText.trim() && !voiceBlob)) return
    setReplySending(true)
    setReplyNotice(null)
    try {
      const supabase = createClient()
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      const audio_base64 = voiceBlob ? await blobToBase64(voiceBlob) : undefined
      const r = await fetch('/api/bcps/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: openMessage.id, action: 'reply', reply_text: replyText.trim(), audio_base64 }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not send reply.')
      setReplyNotice(j.warning ? `Saved, but not emailed: ${j.warning}` : 'Reply sent.')
      setReplyText('')
      discardVoice()
      loadMessages()
    } catch (e: any) {
      setReplyNotice(e.message || 'Something went wrong.')
    } finally {
      setReplySending(false)
    }
  }

  // Dictation (Web Speech API): transcribes straight into the reply
  // textarea. Only walks NEW results starting at e.resultIndex - this is
  // the same fix already shipped on GeekFon's comment box (2026-07-28),
  // walking from 0 every event in continuous mode re-adds committed text.
  function startDictation() {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      setReplyNotice("Dictation isn't supported in this browser yet. Try typing, or use Chrome/Safari.")
      return
    }
    dictationBaseRef.current = replyText ? replyText.trim() + ' ' : ''
    finalTranscriptRef.current = ''
    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (e: any) => {
      let interimText = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTranscriptRef.current += transcript + ' '
        else interimText += transcript
      }
      setReplyText((dictationBaseRef.current + finalTranscriptRef.current).trimStart() + (interimText ? '…' + interimText : ''))
    }
    recognition.onerror = () => setDictating(false)
    recognition.onend = () => {
      setDictating(false)
      setReplyText((dictationBaseRef.current + finalTranscriptRef.current).trimStart())
    }
    recognitionRef.current = recognition
    recognition.start()
    setDictating(true)
  }

  function stopDictation() {
    recognitionRef.current?.stop()
  }

  // Voice-note recording (MediaRecorder): a real recorded clip, uploaded
  // on send and attached to the outgoing email as a link, same tool
  // GeekFon uses for its Plus/Pro voice comments - just no tier gate here.
  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setReplyNotice("Voice notes need microphone access, which isn't available here.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setVoiceBlob(blob)
        setVoiceUrl(URL.createObjectURL(blob))
        setRecording(false)
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      setReplyNotice('Microphone access was blocked or unavailable.')
    }
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  function discardVoice() {
    setVoiceBlob(null)
    setVoiceUrl(null)
  }

  function handleMicClick() {
    if (recording) { stopRecording(); return }
    if (dictating) { stopDictation(); return }
    setMicMenuOpen((v) => !v)
  }

  async function requestAccess() {
    if (!openMessage) return
    setAccessRequesting(true)
    setAccessNotice(null)
    try {
      const supabase = createClient()
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      const r = await fetch('/api/bcps/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: openMessage.id, action: 'request_access' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not request access.')
      if (j.already) {
        setAccessNotice(j.status === 'approved' ? 'Access already granted for this person.' : 'A request is already pending with them.')
      } else {
        setAccessNotice(j.warning ? `Request saved, but not emailed: ${j.warning}` : 'Access request sent to them by email.')
      }
      loadAccessRequests()
    } catch (e: any) {
      setAccessNotice(e.message || 'Something went wrong.')
    } finally {
      setAccessRequesting(false)
    }
  }

  // Which widgets are eligible to render at all right now (independent of
  // saved order/span) - the same conditions each section already gated on
  // before this became a reorderable grid.
  const dashWidgetVisible: Record<string, boolean> = {
    cert: certProgress !== null,
    stats: true,
    messages: canManageMessages,
    tools: true,
    audit: !!myDeptSlug,
    meetingnotes: true,
    documents: true,
    accessrequests: canManageMessages && accessRequests.length > 0,
    banner: true,
    recentnotes: true,
    refgroup: true,
    profile: !!myDeptSlug,
  }
  const visibleDashLayout = dashLayout.filter((w) => dashWidgetVisible[w.id])

  return (
    <div className="dashboard">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-text">
          <h2>
            Good morning,{' '}
            {myDeptSlug ? (
              <button className="welcome-name-btn" onClick={scrollToProfile} title="View department profile">
                {viewAsUserId ? MEMBERS.find(m => m.initials === viewAsUserId)?.name.split(' ')[0] ?? 'Team' : (userName ?? 'there')}
              </button>
            ) : (
              viewAsUserId ? MEMBERS.find(m => m.initials === viewAsUserId)?.name.split(' ')[0] ?? 'Team' : (userName ?? 'there')
            )}
          </h2>
          <p>Here&apos;s what&apos;s happening across Broward County Public Schools today.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate('notes')}>
          + New Meeting Note
        </button>
      </div>

      {/* Customize layout, per Sean 2026-08-29: off by default so the
          dashboard looks and behaves exactly as before. Turning it on
          reveals a drag handle + half/full-width toggle on every card
          below, matching the approved "Flexible Dashboard Grid" mockup
          (2026-08-29). Order and widths persist per browser
          (localStorage) - no account-wide schema change. */}
      <div className="dash-grid-toolbar">
        {customizingLayout && (
          <button className="btn-outline" type="button" onClick={resetDashLayout}>Reset layout</button>
        )}
        <button
          className={customizingLayout ? 'btn-primary' : 'btn-outline'}
          type="button"
          onClick={() => setCustomizingLayout(v => !v)}
        >
          {customizingLayout ? 'Done arranging' : 'Customize layout'}
        </button>
      </div>

      <div className="dashboard-grid">
        {visibleDashLayout.map((w) => {
          switch (w.id) {

            // WCM Certification status banner - per the approved dashboard
            // brief (bcps-wcm-dashboard-preview-2026-08-27, certBanner()).
            // Covers all three states (not started, in progress, complete).
            case 'cert':
              if (certProgress === null) return null
              return dashCell('cert', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>WCM Certification</h3>
                    <a href="/certification/departments" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                      {certProgress.allDone ? 'View certificate →' : 'Continue →'}
                    </a>
                  </div>
                  <div style={{ padding: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ flexShrink: 0, minWidth: 90 }}>
                      <div style={{ fontSize: '28px', fontWeight: 900, color: certProgress.allDone ? '#16750C' : 'var(--primary)', lineHeight: 1 }}>{certProgress.pct}%</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap' }}>
                        {certProgress.allDone ? 'Complete' : `${certProgress.completed} of ${certProgress.total} pages`}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: certProgress.pct + '%', background: certProgress.allDone ? '#16750C' : 'var(--primary)', borderRadius: 8, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                    {certProgress.allDone && (
                      <div style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>+</div>
                    )}
                    {!certProgress.allDone && certProgress.completed === 0 && !certProgress.hasAnyProgress && (
                      <a href="/certification/departments/welcome" style={{ flexShrink: 0, display: 'inline-block', padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 6, fontSize: '12px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Begin Certification
                      </a>
                    )}
                    {!certProgress.allDone && certProgress.hasAnyProgress && (
                      <a href="/certification/departments" style={{ flexShrink: 0, display: 'inline-block', padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 6, fontSize: '12px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Continue Certification
                      </a>
                    )}
                  </div>
                </div>
              ))

            case 'stats':
              return dashCell('stats', (
                <div className="stats-grid" style={{ marginBottom: 0 }}>
                  {STAT_CARDS.map((card) => (
                    <div key={card.label} className="stat-card">
                      <div className="stat-value">{card.value}</div>
                      <div className="stat-label">{card.label}</div>
                      <div className={`stat-delta ${card.positive ? 'positive' : 'neutral'}`}>{card.delta}</div>
                    </div>
                  ))}
                </div>
              ))

            // Recent Messages - site reports from the SiteFeedback widget,
            // per Sean 2026-07-29: the bare-bones inbox. Gated on
            // canManageMessages (bcps role admin or superadmin), not the
            // Sidebar's binary superadmin/user role. Click a message to
            // read it (marks read) and reply inline - the reply emails the
            // reporter directly if we have their address.
            case 'messages':
              return dashCell('messages', (
                <div className="dash-panel" id="dashboard-messages-panel">
                  <div className="dash-panel-header">
                    <h3>Recent Messages</h3>
                    {messages.length > 0 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {messages.filter(m => !m.read_at).length} unread
                      </span>
                    )}
                  </div>
                  <div className="note-list">
                    {messagesLoading ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : messages.length === 0 ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No messages yet.</div>
                    ) : messages.slice(0, 6).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => openAndMarkRead(m)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left', background: 'none',
                          border: 'none', borderBottom: '1px solid var(--border)', padding: '10px 0',
                          cursor: 'pointer', font: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {!m.read_at && (
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                          )}
                          <span style={{ fontWeight: m.read_at ? 600 : 800, color: 'var(--text)', fontSize: '13px' }}>
                            {m.email || 'Not identified'}
                          </span>
                          <span className="dot">&middot;</span>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{relativeTime(m.created_at)}</span>
                          {m.status === 'replied' && (
                            <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 800, color: '#16750C', textTransform: 'uppercase' }}>Replied</span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          {m.page ? `${m.page} — ` : ''}{m.message.length > 110 ? m.message.slice(0, 107) + '...' : m.message}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))

            // Your Tools - daily-use tool launchers, per Sean 2026-08-27.
            case 'tools':
              return dashCell('tools', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>Your Tools</h3>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Daily use</span>
                  </div>
                  <div className="tool-tiles">
                    {TOOL_TILES.map(t => (
                      t.external ? (
                        <a key={t.key} className="tool-tile" href={t.href} target="_blank" rel="noopener noreferrer">
                          <span className="tool-tile-icon">{t.icon}</span>
                          <span className="tool-tile-name">{t.name}</span>
                          <span className="tool-tile-desc">{t.desc}</span>
                        </a>
                      ) : (
                        <button key={t.key} type="button" className="tool-tile" onClick={() => onNavigate(t.page!)}>
                          <span className="tool-tile-icon">{t.icon}</span>
                          <span className="tool-tile-name">{t.name}</span>
                          <span className="tool-tile-desc">{t.desc}</span>
                        </button>
                      )
                    ))}
                  </div>
                </div>
              ))

            // My Page Audit - only present once a department context
            // resolves (myDeptSlug), per Sean 2026-08-27/28.
            case 'audit':
              return dashCell('audit', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>My Page Audit</h3>
                  </div>
                  {deptDetailLoading ? (
                    <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                  ) : deptDetail ? (
                    <>
                      <div className="audit-summary">
                        <div className="audit-stat">
                          <div className="audit-stat-value" style={{ color: deptDetail.ada_score == null ? 'var(--text-muted)' : deptDetail.ada_score >= 80 ? '#16a34a' : deptDetail.ada_score >= 60 ? '#b45309' : '#dc2626' }}>
                            {deptDetail.ada_score != null ? Math.round(deptDetail.ada_score) : '—'}
                          </div>
                          <div className="audit-stat-label">Current ADA score</div>
                        </div>
                        <div className="audit-stat">
                          <div className="audit-stat-value">{deptDetail.current_round ?? '—'}</div>
                          <div className="audit-stat-label">Audit round</div>
                        </div>
                        <div className="audit-stat">
                          <div className="audit-stat-value" style={{ fontSize: 15 }}>
                            {deptDetail.audit_date ? new Date(deptDetail.audit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                          </div>
                          <div className="audit-stat-label">Last audit date</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                        <button className="btn-primary" onClick={() => onNavigate('department-audit')}>Submit page for review</button>
                        <button className="btn-outline" onClick={() => onNavigate('department-audit')}>View full audit findings</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No audit on file yet for your department.</div>
                  )}
                </div>
              ))

            // Latest Meeting Notes - directly under My Page Audit in the
            // shipped default order, per Sean 2026-08-27.
            case 'meetingnotes':
              return dashCell('meetingnotes', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>Latest Meeting Notes</h3>
                    <button className="link-btn" onClick={() => onNavigate('notes')}>View all &rarr;</button>
                  </div>
                  <div className="note-list">
                    {docsLoading ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : meetingNotes.length === 0 ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No meeting notes yet.</div>
                    ) : meetingNotes.map(d => (
                      <div key={d.id} className="note-list-item">
                        <a className="note-list-title" href={d.doc_url} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{d.title}</a>
                        <div className="note-list-meta">
                          <span>{d.series_title || 'Meeting Notes'}</span>
                          {d.date && (<><span className="dot">&middot;</span><span>{d.date}</span></>)}
                        </div>
                        {d.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>{d.description}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button className="btn-outline" onClick={() => onNavigate('notes')}>View all meeting notes</button>
                  </div>
                </div>
              ))

            // Banner Submissions - WCM Banner Submission App, built
            // 2026-09-02 for Vanessa Deslandes / District Web Team on our
            // own stack (replacing the Power Apps mockup). Self-contained
            // widget: it does its own data fetching via /api/banner/*, so
            // this case only needs to mount it.
            case 'banner':
              return dashCell('banner', <BannerWidget />)

            // Documents - 5 newest or up to 5 favorited, per Sean
            // 2026-08-27. Reads the same access-filtered catalog as the
            // Documents page.
            case 'documents':
              return dashCell('documents', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>Documents</h3>
                    <div className="doc-toggle">
                      <button className={docMode === 'favorites' ? 'active' : ''} onClick={() => setDocMode('favorites')}>Favorites</button>
                      <button className={docMode === 'newest' ? 'active' : ''} onClick={() => setDocMode('newest')}>Newest</button>
                    </div>
                  </div>
                  <div className="note-list">
                    {docsLoading ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : documentsList.length === 0 ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                        {docMode === 'favorites' ? 'No favorited documents yet.' : 'No documents yet.'}
                      </div>
                    ) : documentsList.map(d => (
                      <div key={d.id} className="note-list-item" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, background: 'var(--bg-page)', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)',
                        }}>
                          {(d.type || 'DOC').slice(0, 3).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <a className="note-list-title" href={d.doc_url} style={{ color: 'var(--primary)', textDecoration: 'none' }}>{d.title}</a>
                          <div className="note-list-meta">
                            {d.type && (<span>{d.type}</span>)}
                            {d.date && (<><span className="dot">&middot;</span><span>{d.date}</span></>)}
                          </div>
                        </div>
                        {d.featured && (
                          <span title="Favorited" style={{ color: '#C55326', fontSize: 14, flexShrink: 0 }}>&#9733;</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <button className="btn-outline" onClick={() => onNavigate('documents')}>Browse all documents</button>
                  </div>
                </div>
              ))

            // Access Requests - outstanding/active grants this admin has
            // out, per Sean 2026-07-29, so a pending or approved request
            // doesn't get lost once the email is sent.
            case 'accessrequests':
              return dashCell('accessrequests', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>Access Requests</h3>
                  </div>
                  <div className="note-list">
                    {accessRequests.map(ar => (
                      <div key={ar.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{ar.target_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {ar.status === 'approved' ? `Approved ${relativeTime(ar.approved_at || ar.requested_at)}` : `Requested ${relativeTime(ar.requested_at)} — waiting on them`}
                          </div>
                        </div>
                        {ar.status === 'approved' ? (
                          <a href={`/support-access/${ar.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>View &rarr;</a>
                        ) : (
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#C55326', textTransform: 'uppercase' }}>Pending</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))

            // Recent Notes - live assignment notes from Supabase.
            case 'recentnotes':
              return dashCell('recentnotes', (
                <div className="dash-panel">
                  <div className="dash-panel-header">
                    <h3>Recent Notes</h3>
                    <button className="link-btn" onClick={() => onNavigate('bcps-assignments')}>View assignments &rarr;</button>
                  </div>
                  <div className="note-list">
                    {notesLoading ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                    ) : notes.length === 0 ? (
                      <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No notes yet.</div>
                    ) : notes.map((note) => (
                      <div key={note.id} className="note-list-item">
                        <button className="note-list-title" onClick={() => setOpenNote(note)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontWeight: 700, color: 'var(--primary)' }}>{slugToTitle(note.assignment_slug)}</button>
                        <div className="note-list-meta">
                          <span>{note.author === 'June 10 Meeting' ? 'June 10 Meeting' : note.author}</span>
                          <span className="dot">·</span>
                          <span>{relativeTime(note.created_at)}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
                          {note.note_text.length > 120
                            ? note.note_text.slice(0, 117) + '...'
                            : note.note_text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))

            // Reference-tile group - Team / My Department / Quick Actions /
            // Consoles. A single locked unit per Sean 2026-08-29: it always
            // moves and resizes as one, collapsing from a 2x2 grid to two
            // stacked rows of 2 when set to half-width.
            case 'refgroup': {
              const myDept = teamMembers.find(m => m.user_id === meId)?.department
              const refSpan = spanOfDashCell('refgroup')
              return dashCell('refgroup', (
                <div className="locked-ref-group">
                  <div className="locked-ref-group-head">
                    <span aria-hidden="true">&#128274;</span> Team &middot; My Department &middot; Quick Actions &middot; Consoles
                  </div>
                  <div className={`locked-ref-grid${refSpan === 1 ? ' span-1' : ''}`}>
                    <div className="dash-panel">
                      <div className="dash-panel-header">
                        <h3>Team</h3>
                        <button className="link-btn" onClick={() => onNavigate('members')}>View all &rarr;</button>
                      </div>
                      <div className="member-list">
                        {teamMembers.slice(0, 6).map((m) => (
                          <div key={m.user_id} className="member-row">
                            <div className="avatar avatar-sm" style={{ background: m.color }}>{m.initials}</div>
                            <div className="member-info">
                              <strong>
                                <button onClick={() => router.push(`/?page=members&member=${m.user_id}`, { scroll: false })}
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700, color: 'var(--primary)' }}>
                                  {m.name}
                                </button>
                              </strong>
                              <span>{m.department?.name || (m.role === 'superadmin' ? 'Superadmin' : 'Team Member')}</span>
                            </div>
                            <div className="member-status online" />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="dash-panel">
                      <div className="dash-panel-header">
                        <h3>My Department</h3>
                        {myDept && <button className="link-btn" onClick={() => router.push(`/?page=departments&dept=${myDept.slug}`, { scroll: false })}>Open profile &rarr;</button>}
                      </div>
                      <div style={{ padding: '4px 0' }}>
                        {myDept ? (
                          <>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>{myDept.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{myDept.division || ''}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No department assigned yet.</div>
                        )}
                      </div>
                    </div>

                    <div className="dash-panel">
                      <div className="dash-panel-header">
                        <h3>Quick Actions</h3>
                      </div>
                      <div className="quick-actions">
                        <button className="quick-action-btn" onClick={() => onNavigate('notes')}>
                          <span className="qa-icon">{FlatIcons.note}</span>
                          <span>Write a Note</span>
                        </button>
                        <button className="quick-action-btn" onClick={() => onNavigate('departments')}>
                          <span className="qa-icon">{FlatIcons.building}</span>
                          <span>Browse Departments</span>
                        </button>
                        <button className="quick-action-btn" onClick={() => onNavigate('analytics')}>
                          <span className="qa-icon">{FlatIcons.chart}</span>
                          <span>View Analytics</span>
                        </button>
                        <button className="quick-action-btn" onClick={() => onNavigate('superadmin')}>
                          <span className="qa-icon">{FlatIcons.shield}</span>
                          <span>SuperAdmin Panel</span>
                        </button>
                      </div>
                    </div>

                    <div className="dash-panel">
                      <div className="dash-panel-header">
                        <h3>Your Consoles</h3>
                      </div>
                      <div className="console-grid">
                        <button className="console-card" onClick={() => onNavigate('marcomm')}>
                          <div className="console-icon">{FlatIcons.megaphone}</div>
                          <div className="console-name">MarComm</div>
                          <div className="console-desc">Marketing & Comms</div>
                        </button>
                        <button className="console-card" onClick={() => onNavigate('minutes')}>
                          <div className="console-icon">{FlatIcons.clock}</div>
                          <div className="console-name">Minutes</div>
                          <div className="console-desc">Meeting Records</div>
                        </button>
                        <button className="console-card" onClick={() => onNavigate('wcm')}>
                          <div className="console-icon">{FlatIcons.globe}</div>
                          <div className="console-name">WCM</div>
                          <div className="console-desc">Web Content</div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            }

            // Member Profile, per Sean 2026-08-27: what a member sees when
            // they click their own name in the welcome banner. Renamed
            // from "Department Profile" and given a Name/Role header row +
            // avatar to match the approved brief's memberProfileCard(),
            // which this is modeled on (Sean, 2026-08-28) -
            // Department/Division/WCM/Director/Chief are kept alongside
            // since they're real, useful context the mockup's synthetic
            // data didn't need to show.
            case 'profile':
              return dashCell('profile', (
                <div className="profile-section dash-panel" ref={profileRef} id="dashboard-profile-card">
                  <div className="dash-panel-header">
                    <h3>Member Profile</h3>
                    {deptDetail?.website_url && (
                      <a className="link-btn" href={deptDetail.website_url.startsWith('http') ? deptDetail.website_url : `https://${deptDetail.website_url}`} target="_blank" rel="noopener noreferrer">
                        View live page &rarr;
                      </a>
                    )}
                  </div>
                  {deptDetailLoading ? (
                    <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>Loading...</div>
                  ) : deptDetail ? (
                    <>
                      {(() => {
                        const memberName = viewAsUserId ? MEMBERS.find(m => m.initials === viewAsUserId)?.name : userName
                        const memberRole = viewAsUserId
                          ? MEMBERS.find(m => m.initials === viewAsUserId)?.role
                          : teamMembers.find(m => m.user_id === meId)?.role
                        const initials = memberName ? memberName.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() : '—'
                        return (
                          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap' }}>
                            <div style={{
                              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
                              background: 'linear-gradient(135deg, var(--primary) 0 55%, #16750C 55% 100%)',
                              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: 15,
                            }}>
                              {initials}
                            </div>
                            <div className="profile-row" style={{ flex: 1 }}>
                              <div className="profile-block">
                                <div className="pb-k">Name</div>
                                <div className="pb-v">{memberName || 'Unknown'}</div>
                              </div>
                              <div className="profile-block">
                                <div className="pb-k">Role</div>
                                <div className={`pb-v${memberRole ? '' : ' muted'}`}>{memberRole || 'Not listed'}</div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="profile-row">
                        <div className="profile-block">
                          <div className="pb-k">Department</div>
                          <div className="pb-v">{deptDetail.name}</div>
                        </div>
                        <div className="profile-block">
                          <div className="pb-k">Division</div>
                          <div className={`pb-v${deptDetail.division ? '' : ' muted'}`}>{deptDetail.division || 'Not listed'}</div>
                        </div>
                        <div className="profile-block">
                          <div className="pb-k">Web Content Manager</div>
                          <div className={`pb-v${deptDetail.wcm_name ? '' : ' muted'}`}>{deptDetail.wcm_name || 'Unassigned'}</div>
                        </div>
                        <div className="profile-block">
                          <div className="pb-k">Director</div>
                          <div className={`pb-v${deptDetail.director_name ? '' : ' muted'}`}>{deptDetail.director_name || 'Not listed'}</div>
                        </div>
                        {deptDetail.chief_name && (
                          <div className="profile-block">
                            <div className="pb-k">{deptDetail.chief_title || 'Chief'}</div>
                            <div className="pb-v">{deptDetail.chief_name}</div>
                          </div>
                        )}
                      </div>
                      {deptDetail.blurb && (
                        <div className="profile-blurb">{deptDetail.blurb}</div>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13px' }}>No department profile on file yet.</div>
                  )}
                </div>
              ))

            default:
              return null
          }
        })}
      </div>

      {openNote && (
        <div onClick={() => setOpenNote(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 680, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{slugToTitle(openNote.assignment_slug)}</h2>
              <button onClick={() => setOpenNote(null)} style={{ background: 'none', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer' }} aria-label="Close">&times;</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 16px' }}>{openNote.author} &middot; {relativeTime(openNote.created_at)}</div>
            <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{openNote.note_text}</p>
          </div>
        </div>
      )}

      {openMessage && (
        <div onClick={() => setOpenMessage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '85vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{openMessage.email || 'Not identified'}</h2>
              <button onClick={() => setOpenMessage(null)} style={{ background: 'none', border: 'none', fontSize: 24, lineHeight: 1, cursor: 'pointer' }} aria-label="Close">&times;</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 16px' }}>
              {openMessage.page ? `${openMessage.page} · ` : ''}{relativeTime(openMessage.created_at)}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 20px' }}>{openMessage.message}</p>

            {(openMessage.admin_reply || openMessage.admin_reply_audio_url) && (
              <div style={{ background: 'var(--bg, #f5f5f5)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Your reply{openMessage.replied_at ? ` · ${relativeTime(openMessage.replied_at)}` : ''}
                </div>
                {openMessage.admin_reply && (
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{openMessage.admin_reply}</div>
                )}
                {openMessage.admin_reply_audio_url && (
                  <audio controls src={openMessage.admin_reply_audio_url} style={{ height: 32, width: '100%', marginTop: openMessage.admin_reply ? 8 : 0 }} />
                )}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              {openMessage.admin_reply ? 'Send another reply' : 'Reply'}
            </label>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, position: 'relative' }}>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                rows={4}
                placeholder={openMessage.email ? `Reply to ${openMessage.email}...` : 'No email on file — this will be saved but not sent.'}
                style={{ flex: 1, width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
              />
              {/* Dictation + voice-note recording, per Sean 2026-07-29: same
                  tool as GeekFon's comment box, but no dictate/record gate -
                  admins get both outright. */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleMicClick}
                  aria-label="Dictate or record a voice reply"
                  title="Dictate or record a voice reply"
                  style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: recording || dictating ? 'none' : '1px solid var(--border)',
                    background: recording || dictating ? '#c0392b' : '#fff',
                    color: recording || dictating ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </button>
                {micMenuOpen && (
                  <div style={{ position: 'absolute', bottom: 44, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.14)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180, zIndex: 5 }}>
                    <button type="button" onClick={() => { setMicMenuOpen(false); startDictation() }} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
                      Dictate
                    </button>
                    <button type="button" onClick={() => { setMicMenuOpen(false); startRecording() }} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--text)', background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px', cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
                      Record voice note
                    </button>
                  </div>
                )}
              </div>
            </div>
            {(dictating || recording) && (
              <p style={{ fontSize: 11.5, color: '#c0392b', fontWeight: 700, margin: '6px 0 0' }}>
                {dictating ? 'Listening…' : 'Recording…'} Click the mic to stop.
              </p>
            )}
            {voiceUrl && !recording && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg, #f5f5f5)', border: '1px solid var(--border)', borderRadius: 100, padding: '6px 8px 6px 14px', marginTop: 8 }}>
                <audio controls src={voiceUrl} style={{ height: 32, flex: 1, minWidth: 0 }} />
                <button type="button" onClick={discardVoice} title="Discard" style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            )}
            {replyNotice && (
              <p style={{ fontSize: 12.5, color: replyNotice.startsWith('Reply sent') ? '#16750C' : '#c0392b', margin: '8px 0 0' }}>{replyNotice}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                onClick={sendReply}
                disabled={replySending || (!replyText.trim() && !voiceBlob)}
                style={{ padding: '10px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: replySending ? 'default' : 'pointer', opacity: replySending || (!replyText.trim() && !voiceBlob) ? 0.6 : 1 }}
              >
                {replySending ? 'Sending...' : 'Send Reply'}
              </button>

              {/* Request Access: only offered when this report is tied to a
                  real account (user_id) - per Sean 2026-07-29, this only
                  ever fires off a specific ticket, never a standing button
                  on every member's profile. Sends them a read-only,
                  member-approved access request by email; nothing is
                  visible until they say yes. Positioned right, Reply left,
                  per Sean 2026-07-29. */}
              {openMessage.user_id && (
                <button
                  onClick={requestAccess}
                  disabled={accessRequesting}
                  style={{ padding: '10px 20px', background: '#fff', color: 'var(--primary)', border: '1.5px solid var(--primary)', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: accessRequesting ? 'default' : 'pointer', opacity: accessRequesting ? 0.6 : 1 }}
                >
                  {accessRequesting ? 'Requesting...' : 'Request Access'}
                </button>
              )}
            </div>
            {accessNotice && (
              <p style={{ fontSize: 12.5, color: accessNotice.includes('sent') || accessNotice.includes('already') ? '#16750C' : '#c0392b', margin: '8px 0 0' }}>{accessNotice}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

