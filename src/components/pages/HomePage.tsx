'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { PageId, BreadcrumbItem } from '@/lib/types'
import DepartmentsPage from './DepartmentsPage'
import AnalyticsPage from './AnalyticsPage'
import WidgetsPage from './WidgetsPage'
import DashboardPage from './DashboardPage'
import MarcommAssignmentsPage from './MarcommAssignmentsPage'
import { WcmCommunityHub, WcmHubCards, type CertStatus } from './WCMPage'
import { useBCPSShell } from '@/components/BCPSShell'
import SharedViewAsButton from '@/components/ViewAsButton'
import type { AuditV3 } from '@/components/bcps/AuditViewer'
import SiteAudit from '@/components/bcps/SiteAudit'
import { SAMPLE_SUPERADMIN_ID, Icons } from '@/components/Sidebar'
import { SUPERADMIN_PAGES_SET } from '@/lib/superadmin-pages'
import { TOOLS, TOOL_GROUPS, TOP_TOOLS, type Tool } from '@/lib/bcps-tools'
import {
  REVIEW_CYCLE, REVIEW_WINDOWS, NEXT_CYCLE_START, windowForDivision, windowState,
  formatWindowDate, formatWindowRange, type ReviewWindow,
} from '@/lib/review-windows'

// The BCPS MarComm dashboard (Sean, 2026-10-01; playbook wcm-community-hub,
// "BCPS MarComm Dashboard"). One home page that sets itself up for whoever
// signs in: the District Web Team, a director, or a WCM. /api/bcps/home
// decides the experience server-side and returns only that person's data.
// Every version has the same two layers: a status strip ("what needs my
// attention") and tabs of cards ("where do I go"). No placeholders: a card
// only appears when its link works for the person seeing it.
//
// The previous dashboard is kept whole as the District Web Team's Team
// Operations tab, so none of its tiles are lost while they move to their new
// homes.
//
// "View as" (2026-10-01): each sample identity previews its own home. The
// Director and WCM samples use fictitious departments and people (never a
// real person's account, per Sean 2026-08-27); every link and button in the
// preview is the real one, so the preview also proves what a director or
// WCM can open.

const supabase = createClient()
type Navigate = (page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => void
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Director confirmation form (bcps_wcm_roster_submissions), the same link the
// roster page and director emails use.
const ROSTER_SIGNUP_URL = '/wcm-roster-signup'
// Official 2026 WCM Certified shield (Sean, 2026-10-06).
const CERT_SHIELD_SRC = '/brand/wcm-certified-shield-2026.png'
const HOT_LAB_JOIN_URL = 'https://teams.microsoft.com/meet/264785803068551?p=uQvBT8hLfn90fHBTN0'
const DIRECTOR_PLAYBOOK_URL = '/playbooks/director-department'
// Department certification deadline (Sept 30 applies to schools only).
const DEPT_CERT_DEADLINE = 'October 30, 2026'
// Director videos (Sean, 2026-10-01). For now each one is a still image with
// Sean's narration until he records a scroll-through of the dashboard to
// replace it. Stills live in the public bcps-public bucket, dashboard-media/.
// The narration is Sean's own recording (HQ > Recording Queue, 2026-10-05),
// leveled into the public site-audio bucket. Set a video to null to hide its card.
interface NarratedMedia {
  title: string
  sub: string
  still: string
  audio: string
  transcript: string[]
}
const MEDIA_BASE = 'https://fwbhwfxpncrsfhttimna.supabase.co/storage/v1'
const mediaStill = (name: string) => `${MEDIA_BASE}/render/image/public/bcps-public/dashboard-media/${name}?width=960&quality=80`
const siteAudio = (name: string) => `${MEDIA_BASE}/object/public/site-audio/bcps/${name}`

const WALKTHROUGH_VIDEO: NarratedMedia | null = {
  title: 'Start here: What BCPS MarComm is, and why we built it',
  sub: 'Two minutes from Sean A. Russell, District Webmaster.',
  still: mediaStill('director-walkthrough-still.png'),
  audio: siteAudio('director-walkthrough-narration-1791197518260.wav'),
  transcript: [
    'Hi, I\u2019m Sean A. Russell, District Webmaster in the Office of Communications. Thank you for taking two minutes with me. This is BCPS MarComm, and this page was built for you.',
    'Every department has a website, and families, staff, and vendors count on it being right. Behind each one is a Web Content Manager from your team. BCPS MarComm is where those WCMs are trained, supported, and connected with the District Web Team, so your website stays accurate, accessible, and on brand.',
    'Here\u2019s what you\u2019ll find. At the top is your department at a glance. My Team shows your Web Content Managers, and where each one stands with certification, which is due October 30. Website Review explains how we review every department website, division by division, and when your window is. Analytics shows how many people use your pages, and which ones they visit most. Meeting Notes keeps the recaps that matter to you in one place. And Widgets shows tools we can build for your department.',
    'The biggest difference you can make is backing your WCM. Make time for the certification, and for the updates that come out of your review. If your department doesn\u2019t have a WCM yet, you can confirm one right from this page.',
    'Any question, any time, use the blue message button in the corner. It comes straight to us. Thank you for supporting your team.',
  ],
}

const REVIEW_VIDEO: NarratedMedia | null = {
  title: 'How the department review works',
  sub: 'Sean walks through the five steps and the three review windows.',
  still: mediaStill('director-review-still.png'),
  audio: siteAudio('director-review-narration-1791197517965.wav'),
  transcript: [
    'This school year, the District Web Team is meeting with every department to make your web pages better. Here\u2019s how it works, and when your turn comes up.',
    'The review runs every year, July 1 through June 30, in three windows. Window one, October 1 through December 18, covers our priority divisions: Human Resources, Student Services, Academics, and Chief of Staff. Window two, January 11 through March 31, is Finance, Strategy and Operations, Facilities, and Safety and Security. Window three, April 1 through June 30, is Information Systems, Learning Communities, and Independent Offices.',
    'Every review follows five steps. First, your WCM completes a short page checklist. Second, your WCM brings you to a one-hour meeting with our team, covering page setup, audit findings, accessibility, and the tools available to you. Third, we send you a written playbook with a timetable, usually two weeks to a month. Fourth, we build the changes together with your WCM. And fifth, you review the finished site and sign off.',
    'When your window opens, the Book your meeting button on the Website Review tab comes alive. Want to meet sooner? Use Request an earlier meeting, and we\u2019ll fit you in.',
    'Most of the work happens this first year, so each new cycle gets lighter. Thanks for working with us.',
  ],
}

interface WcmStatus {
  name: string
  email: string | null
  sub_department: string | null
  has_account: boolean
  certified: boolean
  certified_at: string | null
  progress_pct: number
}

interface DepartmentAnalytics {
  period: string
  visitors: number | null
  new_visitors: number | null
  visits: number | null
  engaged_pct: number | null
  avg_seconds: number | null
  top_pages: { title: string; path: string; visits: number; visitors: number; avg_seconds: number }[]
}

interface DepartmentSummary {
  id: string
  name: string
  division: string | null
  website_url: string | null
  audit_status: string | null
  audit_date?: string | null
  ada_score?: number | null
  findings_open: number
  findings_fixed: number
  wcms: WcmStatus[]
  analytics?: DepartmentAnalytics | null
  web_review?: AuditV3 | null
}

interface WidgetItem { slug: string; title: string; description: string | null; preview_path: string | null; can_edit?: boolean }

interface Assignment {
  slug: string
  title: string
  role: 'lead' | 'support'
  status: string
  date_label: string | null
  date_iso: string | null
  past_date: boolean
  priority: 'high' | 'medium' | 'low' | null
}

interface TeamMemberWork {
  user_id: string
  name: string
  email: string
  title: string | null
  department: string | null
  team: 'comms' | 'appsvc'
  assignments: Assignment[]
}

// Same initials and color rule as /api/bcps/members, so a person's avatar
// matches the one on the Members page and the previous Team tile.
const AVATAR_COLORS = ['#1672A7', '#7B5EA7', '#2E8B57', '#D4600A', '#C0392B', '#0E7C86', '#8E44AD', '#B7791F']
function avatarColor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}

// Opens one assignment's notes on the Web Team Assignments page.
function openAssignment(slug: string) {
  window.location.href = `/?page=bcps-assignments&row=${encodeURIComponent(slug)}`
}

// Analytics and Widgets tabs render the same pages the menu opens, so a tab
// never shows less than its page (Sean, 2026-10-01).
function AnalyticsTabPage({ onShowToast }: { onShowToast?: (msg: string) => void }) {
  const { role, viewAs, canManageMessages } = useBCPSShell()
  const sa = role === 'superadmin' && (!viewAs || viewAs.id === SAMPLE_SUPERADMIN_ID)
  return <AnalyticsPage onShowToast={onShowToast ?? (() => {})} canSync={sa} canManageCampaigns={sa || (!viewAs && canManageMessages)} />
}

interface TeamProgram {
  certification: { division: string; wcms: number; certified: number }[]
  wcms_total: number
  wcms_certified: number
  directors_on_file: number
  directors_signed_in: number
  departments_total: number
  departments_with_wcm: number
  open_findings: number
  windows: { id: number; departments: number; signed_off: number }[]
}

interface TeamAda {
  sites_scanned: number
  average_score: number | null
  scans_30d: number
  last_scan: string | null
  lowest: { department: string; score: number }[]
}

interface TeamBanners { pending: number; approved: number; rejected: number }

interface KbArticle { id: string; topic: string; title: string; summary: string; href: string }

interface TeamHomeData {
  kb_articles?: KbArticle[]
  program: TeamProgram
  ada: TeamAda
  banners: TeamBanners
  proud_points?: TeamBanners & { ready: number }
  my_assignments: Assignment[]
  decisions?: { roster_pending: { id: string; department_name: string | null; director_name: string | null; wcm_name: string | null; submitted_at: string | null }[] }
  team_members?: TeamMemberWork[]
}

interface DirectorNote {
  id: string
  title: string
  description: string
  href: string
  link_label: string
  department_id: string | null
  posted_at: string
}

interface HomeData {
  experience: 'superadmin' | 'dwt' | 'director' | 'school_wcm' | 'wcm' | 'member'
  is_dwt: boolean
  is_director: boolean
  is_superadmin?: boolean
  my_certified?: boolean
  my_cert?: { certified: boolean; done: number; total: number; pct: number } | null
  team_kind?: 'comms' | 'appsvc' | null
  team_home?: TeamHomeData | null
  is_wcm: boolean
  name: string | null
  email: string
  led_department_ids: string[]
  departments: DepartmentSummary[]
  team: { roster_pending: number; messages_unread: number; access_requests: number; certifications_7d: number } | null
  widgets?: WidgetItem[]
  // Latest Department WCM Hot Labs the WCM can open (newest first).
  hot_labs?: { title: string; date: string; url: string }[]
  // Knowledge base for directors and WCMs (the team's is in team_home).
  kb_articles?: KbArticle[]
  director_notes?: DirectorNote[]
  // School WCMs (2026-10-05): their schools and their own banner requests.
  schools?: { name: string; loc_no: string | null }[]
  my_banners?: { pending: number; ready: number; posted: number; rejected: number } | null
  my_proud_points?: { pending: number; ready: number; posted: number; rejected: number; drafts: number } | null
}

// Same labels the WCM Audit Portal uses (src/app/(bcps)/wcm-portal/page.tsx).
const AUDIT_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'Audit in progress',
  wcm_notified: 'Action required',
  wcm_submitted: 'Submitted, pending review',
  admin_review: 'Under review',
  needs_rework: 'Updates needed',
  complete: 'Complete',
}

/* ─── "View as" samples ──────────────────────────────── */
const SAMPLE_DIRECTOR_ID = 'SDR'
const SAMPLE_WCM_ID = 'SWC'
const SAMPLE_SCHOOL_WCM_ID = 'SSW'

function sampleSchoolWcmData(): HomeData {
  return {
    experience: 'school_wcm', is_dwt: false, is_director: false, is_wcm: true,
    name: 'Jordan Ellis', email: 'sample-school-wcm@preview.local',
    led_department_ids: [], departments: [], team: null,
    schools: [{ name: 'Sample Elementary', loc_no: null }],
    my_banners: { pending: 1, ready: 1, posted: 2, rejected: 1 },
    my_proud_points: { pending: 0, ready: 0, posted: 0, rejected: 0, drafts: 1 },
  }
}

function sampleAnalytics(scale: number): DepartmentAnalytics {
  return {
    period: '2026-09',
    visitors: Math.round(2400 * scale),
    new_visitors: Math.round(800 * scale),
    visits: Math.round(4100 * scale),
    engaged_pct: 68,
    avg_seconds: 195,
    top_pages: [
      { title: 'Sample Services Overview', path: '/bcps-departments/sample/services', visits: Math.round(1300 * scale), visitors: Math.round(700 * scale), avg_seconds: 240 },
      { title: 'Sample Department Home', path: '/bcps-departments/sample', visits: Math.round(950 * scale), visitors: Math.round(620 * scale), avg_seconds: 110 },
      { title: 'Sample Forms and Documents', path: '/bcps-departments/sample/forms', visits: Math.round(520 * scale), visitors: Math.round(340 * scale), avg_seconds: 185 },
      { title: 'Sample Staff Directory', path: '/bcps-departments/sample/staff', visits: Math.round(310 * scale), visitors: Math.round(220 * scale), avg_seconds: 95 },
    ],
  }
}

function sampleDirectorData(real: HomeData | null): HomeData {
  return {
    experience: 'director', is_dwt: false, is_director: true, is_wcm: false,
    name: 'Marcus Bell', email: 'sample.director@preview.local',
    led_department_ids: ['sample-a', 'sample-b'],
    departments: [
      {
        id: 'sample-a', name: 'Sample Purchasing Services', division: 'Finance', website_url: null,
        audit_status: 'wcm_notified', findings_open: 3, findings_fixed: 2,
        wcms: [{ name: 'Wendy Ramirez', email: null, sub_department: null, has_account: true, certified: false, certified_at: null, progress_pct: 94 }],
        analytics: sampleAnalytics(1),
      },
      {
        id: 'sample-b', name: 'Sample Vendor Compliance', division: 'Finance', website_url: null,
        audit_status: 'not_started', findings_open: 0, findings_fixed: 0,
        wcms: [{ name: 'Jordan Lee', email: null, sub_department: null, has_account: true, certified: false, certified_at: null, progress_pct: 0 }],
        analytics: sampleAnalytics(0.15),
      },
    ],
    team: null,
    widgets: real?.widgets ?? [],
    director_notes: [
      { id: 'sample-note-1', title: 'Sample: Department Review Meeting Recap', description: 'After your review meeting, the recap and your playbook timeline appear here.', href: '', link_label: '', department_id: 'sample-a', posted_at: new Date().toISOString() },
    ],
  }
}

function sampleWcmData(): HomeData {
  return {
    experience: 'wcm', is_dwt: false, is_director: false, is_wcm: true,
    name: 'Wendy Ramirez', email: 'sample-wcm@preview.local', led_department_ids: [],
    departments: [{ id: 'sample-a', name: 'Sample Purchasing Services', division: 'Finance', website_url: null, audit_status: 'wcm_notified', findings_open: 3, findings_fixed: 2, wcms: [], analytics: sampleAnalytics(1) }],
    team: null,
    my_certified: false,
    my_cert: { certified: false, done: 41, total: 66, pct: 62 },
  }
}
const SAMPLE_WCM_CERT: CertStatus = { state: 'in_progress', pct: 62 }

/* ─── Shared helpers ─────────────────────────────────── */
function firstName(d: HomeData): string {
  const n = (d.name || '').trim()
  if (n) return n.split(/\s+/)[0]
  return ''
}

function wcmStatusLabel(w: WcmStatus): { text: string; tone: 'done' | 'progress' | 'todo' } {
  if (w.certified) {
    const on = w.certified_at ? new Date(w.certified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
    return { text: on ? `Certified ${on}` : 'Certified', tone: 'done' }
  }
  if (!w.has_account) return { text: 'Not signed up yet', tone: 'todo' }
  if (w.progress_pct > 0) return { text: `In progress: ${w.progress_pct}%`, tone: 'progress' }
  return { text: 'Not started', tone: 'todo' }
}

function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? '-' : n.toLocaleString('en-US')
}
function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '-'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Opens the site-wide message panel (SiteFeedback). An optional message
// starts the panel with that text, which the person can edit before sending.
function openFeedback(message?: string) {
  window.dispatchEvent(new CustomEvent('bcps:open-feedback', { detail: message ? { message } : null }))
}

function DepartmentCard({ dept, showAudit = true }: { dept: DepartmentSummary; showAudit?: boolean }) {
  const certified = dept.wcms.filter((w) => w.certified).length
  return (
    <div className="home-dept">
      <div className="home-dept-head">
        <h3>{dept.name}</h3>
        {showAudit && dept.audit_status && (
          <span className="home-chip">Audit: {AUDIT_LABELS[dept.audit_status] || dept.audit_status}</span>
        )}
      </div>
      {dept.wcms.length === 0 ? (
        <div className="home-dept-empty">
          <p>No Web Content Manager is confirmed for this department yet.</p>
          <a className="home-btn" href={ROSTER_SIGNUP_URL}>Confirm your WCM</a>
        </div>
      ) : (
        <>
          <div className="home-dept-sub">
            {certified} of {dept.wcms.length} certified &middot; deadline {DEPT_CERT_DEADLINE}
          </div>
          <ul className="home-wcm-list">
            {dept.wcms.map((w) => {
              const s = wcmStatusLabel(w)
              return (
                <li key={`${w.email}-${w.name}`}>
                  <div className="home-wcm-name">
                    {w.name}
                    {w.sub_department && <span className="home-wcm-sub">{w.sub_department}</span>}
                  </div>
                  <span className={`home-status ${s.tone}`}>{s.text}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

type StatLink = { label: string; href?: string; onClick?: () => void; external?: boolean }

function StatTile({ label, value, note, tone, link, icon }: { label: string; value: string | number; note?: string; tone?: 'warn'; link?: StatLink; icon?: string }) {
  return (
    <div className={`home-stat${tone ? ` ${tone}` : ''}`}>
      <div className="home-stat-label">{label}</div>
      <div className="home-stat-value">{icon && <img className="home-stat-icon" src={icon} alt="" />}{value}</div>
      {note && <div className="home-stat-note">{note}</div>}
      {link && (link.href
        ? <a className="home-stat-link" href={link.href} {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{link.label} &rarr;</a>
        : <button type="button" className="home-stat-link" onClick={link.onClick}>{link.label} &rarr;</button>)}
    </div>
  )
}

// A still with narration: the still is the play button, then the audio
// player takes over. The transcript is always one click away.
function VideoCard({ media }: { media: NarratedMedia }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [started, setStarted] = useState(false)
  const [length, setLength] = useState<string | null>(null)
  return (
    <div className="home-video">
      <button
        type="button"
        className="home-video-frame"
        aria-label={`Play: ${media.title}`}
        onClick={() => { setStarted(true); audioRef.current?.play().catch(() => {}) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media.still} alt="" loading="lazy" />
        {!started && <span className="home-video-play" aria-hidden="true" />}
        {length && !started && <span className="home-video-len">{length}</span>}
      </button>
      <audio
        ref={audioRef}
        className={started ? 'home-video-audio' : 'home-video-audio idle'}
        src={media.audio}
        preload="metadata"
        controls
        onPlay={() => setStarted(true)}
        onLoadedMetadata={(e) => {
          const s = Math.round(e.currentTarget.duration)
          if (Number.isFinite(s) && s > 0) setLength(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
        }}
      />
      <span className="home-video-title">{media.title}</span>
      <span className="home-video-sub">{media.sub}</span>
      <details className="home-video-transcript">
        <summary>Read the transcript</summary>
        {media.transcript.map((para, i) => <p key={i}>{para}</p>)}
      </details>
    </div>
  )
}

// Shown on every "View as" preview, with the way back (Sean, 2026-10-01:
// the preview needs a Return button right on the page).
function PreviewBanner({ who, children }: { who?: string; children?: React.ReactNode }) {
  const { setViewAs } = useBCPSShell()
  return (
    <div className="home-preview home-preview-bar">
      <span>{children ?? <><strong>Previewing the {who} dashboard</strong> with sample departments and people. Every link and button is the real one.</>}</span>
      <button type="button" className="home-btn" onClick={() => setViewAs(null)}>Return to my view</button>
    </div>
  )
}

// The "View as" choices on the SuperAdmin dashboard: sample people only, one
// per group, never a real person's account (Sean, 2026-10-01).
function ViewAsButton() {
  const { setViewAs } = useBCPSShell()
  return <SharedViewAsButton onPick={setViewAs} />
}

// Fictitious rows for the web team samples, so a preview never shows a real
// team member's work.
const SAMPLE_TEAM_ASSIGNMENTS: Assignment[] = [
  { slug: 'sample-1', title: 'Sample: Department page refresh', role: 'lead', status: 'in-progress', date_label: 'Oct 15, 2026', date_iso: '2026-10-15', past_date: false, priority: 'high' },
  { slug: 'sample-2', title: 'Sample: Review WCM banner requests', role: 'lead', status: 'ongoing', date_label: 'Ongoing', date_iso: null, past_date: false, priority: 'medium' },
  { slug: 'sample-3', title: 'Sample: ADA fixes for a school site', role: 'support', status: 'in-progress', date_label: 'Sep 30, 2026', date_iso: '2026-09-30', past_date: true, priority: 'high' },
  { slug: 'sample-4', title: 'Sample: Hot Lab segment recording', role: 'lead', status: 'pending', date_label: null, date_iso: null, past_date: false, priority: null },
]

/* ─── DIRECTOR ─────────────────────────────────────────── */
type DirectorTab = 'overview' | 'marcomm' | 'audit' | 'review' | 'analytics' | 'notes' | 'widgets' | 'wcm' | 'tools'

// The review window that matters most to this director: the open one, else
// the next upcoming one, else the last one (their departments may span
// divisions).
function primaryWindow(depts: DepartmentSummary[]): ReviewWindow | null {
  const ws = Array.from(new Set(depts.map((d) => windowForDivision(d.division)).filter((w): w is ReviewWindow => !!w)))
    .sort((a, b) => a.start.localeCompare(b.start))
  return ws.find((w) => windowState(w) === 'open') ?? ws.find((w) => windowState(w) === 'upcoming') ?? ws[ws.length - 1] ?? null
}

function DirectorHome({ data, preview, onNavigate }: { data: HomeData; preview?: boolean; onNavigate: Navigate }) {
  const [tab, setTab] = useState<DirectorTab>('overview')
  // Office of Communications leaders who direct a department (Sean,
  // 2026-10-09) keep MarComm Assignments as a tab when they hold its grant.
  const { pages } = useBCPSShell()
  const canMarcomm = !preview && !!pages?.includes('marcomm-assignments')
  const recentNotes = (data.director_notes ?? []).slice(0, 3)
  const led = data.departments.filter((d) => data.led_department_ids.includes(d.id))
  const totalWcms = led.reduce((n, d) => n + d.wcms.length, 0)
  const certified = led.reduce((n, d) => n + d.wcms.filter((w) => w.certified).length, 0)
  const unconfirmed = led.filter((d) => d.wcms.length === 0).length
  const name = firstName(data)
  const myWindow = primaryWindow(led)
  const withAnalytics = led.filter((d) => d.analytics)
  const visitors = withAnalytics.reduce((n, d) => n + (d.analytics?.visitors ?? 0), 0)
  const period = withAnalytics[0]?.analytics?.period
  const almostDone = led.flatMap((d) => d.wcms).filter((w) => !w.certified && w.progress_pct >= 90).length

  const tabs: { id: DirectorTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(canMarcomm ? [{ id: 'marcomm' as DirectorTab, label: 'MarComm Assignments' }] : []),
    { id: 'audit', label: 'Run Audit' },
    { id: 'review', label: 'Website Review' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'notes', label: 'Meeting Notes' },
    ...((data.widgets?.length ?? 0) > 0 ? [{ id: 'widgets' as DirectorTab, label: 'Widgets' }] : []),
    // A director who is also their department's WCM keeps the WCM cards.
    ...(data.is_wcm ? [{ id: 'wcm' as DirectorTab, label: 'My WCM Work' }] : []),
    { id: 'tools', label: 'Tools & Resources' },
  ]

  return (
    <div className="home">
      {preview && <PreviewBanner who="director" />}
      <HomeTabs tabs={tabs} active={tab} onChange={(t) => setTab(t as DirectorTab)} />
      {tab === 'overview' && <>
      <div className={`home-hero${WALKTHROUGH_VIDEO ? ' with-side' : ''}`}>
        <div>
          <div className="home-hero-label">BCPS MarComm Director</div>
          <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
          <p>Your department&apos;s website at a glance: the people who keep it current, how many families and staff use it, when your website review is, and the support behind it. Everything here updates on its own.</p>
          <div className="home-actions">
            <a className="home-btn" href={DIRECTOR_PLAYBOOK_URL}>Open the Director Playbook</a>
            <span className="home-hint">Every update for directors, in one place</span>
          </div>
        </div>
        {WALKTHROUGH_VIDEO && <VideoCard media={WALKTHROUGH_VIDEO} />}
      </div>

      <div className="home-strip">
        <StatTile label="Web Content Managers" value={totalWcms} note={unconfirmed ? `${unconfirmed} department${unconfirmed > 1 ? 's' : ''} still need one` : 'Confirmed on the roster'} tone={unconfirmed ? 'warn' : undefined} />
        <StatTile
          label="Certified"
          value={totalWcms ? `${certified} of ${totalWcms}` : 'None yet'}
          note={`Due ${DEPT_CERT_DEADLINE}.${almostDone ? ` ${almostDone} almost done.` : ''}`}
          tone={totalWcms && certified < totalWcms ? 'warn' : undefined}
        />
        {myWindow && (
          <StatTile
            label="Your review window"
            value={formatWindowRange(myWindow)}
            note={`${myWindow.label}${windowState(myWindow) === 'open' ? ', open now' : windowState(myWindow) === 'closed' ? ', finished' : ''}`}
          />
        )}
        {period && <StatTile label={`Visitors in ${monthLabel(period).split(' ')[0]}`} value={fmtNum(visitors)} note={led.length > 1 ? 'Across your departments’ pages' : 'Across your department’s pages'} />}
      </div>
      </>}

      {tab === 'overview' && (
        <>
          <p className="wcm-hub2-intro">Your Web Content Managers and where each one stands with the Department WCM Certification.</p>
          <div className="home-dept-grid">
            {led.map((d) => <DepartmentCard key={d.id} dept={d} showAudit={false} />)}
          </div>
          <div className="home-actions">
            <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Change or add a WCM</a>
          </div>
          {recentNotes.length > 0 && (
            <div className="home-dept home-section">
              <div className="home-dept-head"><h3>Recent documents</h3></div>
              {recentNotes.map((n) => {
                const d = new Date(n.posted_at)
                return (
                  <div key={n.id} className="home-note">
                    <div className="home-note-date">{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}<b>{d.getDate()}</b></div>
                    <div className="home-note-body">
                      <div className="home-note-title">{n.href ? <a href={n.href}>{n.title}</a> : n.title}</div>
                      {n.description && <div className="home-note-text">{n.description}</div>}
                    </div>
                  </div>
                )
              })}
              <div className="home-actions">
                <button type="button" className="wcm-hub2-card-btn" onClick={() => setTab('notes')}>All meeting notes</button>
              </div>
            </div>
          )}
        </>
      )}
      {tab === 'marcomm' && <MarcommAssignmentsPage embedded />}
      {tab === 'audit' && <RunAuditTab depts={led} canRecheck={false} />}
      {tab === 'review' && <ReviewTab led={led} myWindow={myWindow} />}
      {tab === 'analytics' && <AnalyticsTab led={led} />}
      {tab === 'notes' && <NotesTab notes={data.director_notes ?? []} led={led} />}
      {tab === 'widgets' && <WidgetsTab widgets={data.widgets ?? []} />}
      {tab === 'wcm' && <WcmCommunityHub />}
      {tab === 'tools' && <>
        {/* Ask & Guide folded in here (Sean, Oct 5 OOC Web Huddle). */}
        <DirectorHelp myWindow={myWindow} led={led} />
        <ToolsPanel kind="director" onNavigate={onNavigate} kb={data.kb_articles ?? []} hotLabs={data.hot_labs ?? []} />
      </>}
    </div>
  )
}

function meetingMessage(kind: 'book' | 'earlier', led: DepartmentSummary[], w: ReviewWindow | null): string {
  const names = led.map((d) => d.name).join(', ')
  if (kind === 'book') {
    return `I would like to book our department website review meeting for ${names}${w ? ` (${w.label}, ${formatWindowRange(w)})` : ''}. Times that work for us: `
  }
  return `I would like to request an earlier website review meeting for ${names}${w ? `. Our window is ${w.label} (${formatWindowRange(w)})` : ''}. Times that work for us: `
}

function ReviewTab({ led, myWindow }: { led: DepartmentSummary[]; myWindow: ReviewWindow | null }) {
  const state = myWindow ? windowState(myWindow) : null
  const myWindowIds = new Set(led.map((d) => windowForDivision(d.division)?.id).filter(Boolean))
  return (
    <>
      <p className="wcm-hub2-intro">
        Every school year, July 1 to June 30, the District Web Team reviews every department website with its director and WCM, division by division, in three review windows. Most of the work happens in the first year, so each new cycle is lighter. Here is how it works and when your division is up.
      </p>
      <div className={`home-review-top${REVIEW_VIDEO ? ' with-video' : ''}`}>
        {REVIEW_VIDEO && <VideoCard media={REVIEW_VIDEO} />}
        <div className="home-dept">
          <h3 className="home-card-title">The five steps</h3>
          <ol className="home-steps">
            <li><b>Checklist first.</b> Your WCM completes the page checklist before the meeting.</li>
            <li><b>One-hour meeting.</b> Your WCM brings you to meet the District Web Team: page setup, audit findings, accessibility, and the tools available to you.</li>
            <li><b>Your playbook.</b> We send a written plan with a timetable of two weeks to a month.</li>
            <li><b>We build.</b> The District Web Team and your WCM make the changes.</li>
            <li><b>You sign off.</b> You review the finished site and approve it.</li>
          </ol>
        </div>
      </div>

      <div className="home-dept home-section">
        <div className="home-dept-head">
          <h3>Review windows, {REVIEW_CYCLE}</h3>
          <span className="home-chip">July 1 to June 30</span>
        </div>
        <p className="home-card-text">When your division&apos;s window opens, book your meeting from this page. The first window covers the priority divisions.</p>
        <div className="home-windows">
          {REVIEW_WINDOWS.map((w) => {
            const s = windowState(w)
            const mine = myWindowIds.has(w.id)
            const tag = [s === 'open' ? 'Open' : s === 'closed' ? 'Finished' : null, mine ? 'Your division' : null].filter(Boolean).join(' · ')
            return (
              <div key={w.id} className={`home-win${s === 'open' ? ' open' : ''}${mine ? ' mine' : ''}`}>
                <div className="home-win-label">{w.label}{tag ? ` · ${tag}` : ''}</div>
                <div className="home-win-dates">{formatWindowRange(w)}</div>
                <ul>
                  {w.divisions.map((dv) => (
                    <li key={dv} className={led.some((d) => d.division === dv) ? 'mine' : undefined}>{dv}</li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
        <p className="home-dept-sub home-gap">A new cycle starts {new Date(NEXT_CYCLE_START + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, in the same order.</p>
        <div className="home-actions">
          {state === 'open' && (
            <button type="button" className="home-btn" onClick={() => openFeedback(meetingMessage('book', led, myWindow))}>Book your meeting</button>
          )}
          {state === 'upcoming' && myWindow && (
            <button type="button" className="home-btn" disabled>Book your meeting (opens {formatWindowDate(myWindow.start)})</button>
          )}
          {state !== 'open' && (
            <button type="button" className="wcm-hub2-card-btn" onClick={() => openFeedback(meetingMessage('earlier', led, myWindow))}>
              {state === 'upcoming' ? 'Request an earlier meeting' : 'Request a meeting'}
            </button>
          )}
        </div>
      </div>

      <p className="wcm-hub2-intro">Where each of your sites stands today:</p>
      <div className="home-dept-grid">
        {led.map((d) => {
          const w = windowForDivision(d.division)
          const total = d.findings_open + d.findings_fixed
          const done = d.audit_status === 'complete'
          return (
            <div key={d.id} className="home-dept">
              <div className="home-dept-head">
                <h3>{d.name}</h3>
                <span className={`home-status ${done ? 'done' : total && d.findings_open ? 'todo' : 'progress'}`}>
                  {done ? 'Review complete' : total ? `${d.findings_open} open, ${d.findings_fixed} fixed` : w ? w.label : 'Not scheduled'}
                </span>
              </div>
              <p className="home-card-text">
                {done
                  ? 'Your site has been reviewed and signed off for this school year.'
                  : total
                    ? `The audit found ${total} item${total === 1 ? '' : 's'} to fix. Your WCM works through them, and the District Web Team reviews the fixes.`
                    : w
                      ? `${d.division} is in ${w.label}, ${formatWindowRange(w)}. Your review meeting covers the full site.`
                      : 'This department is not on the review calendar yet. Request a meeting and we will set one up.'}
              </p>
              {d.website_url && <a className="wcm-hub2-card-btn" href={d.website_url} target="_blank" rel="noopener noreferrer">Visit the site</a>}
            </div>
          )
        })}
      </div>
    </>
  )
}

function AnalyticsTab({ led }: { led: DepartmentSummary[] }) {
  const withData = led.filter((d) => d.analytics)
  const [selected, setSelected] = useState<string | null>(null)
  const current = withData.find((d) => d.id === selected) ?? withData[0]
  if (!current?.analytics) {
    return (
      <div className="wcm-hub2-empty">
        Analytics for {led.length > 1 ? 'your departments are' : 'your department is'} not connected yet. Ask the District Web Team and we will connect your pages to the monthly Google Analytics sync.
        {' '}<button type="button" className="home-link-btn" onClick={() => openFeedback('Please connect our department pages to the monthly analytics sync.')}>Send a message</button>
      </div>
    )
  }
  const a = current.analytics
  return (
    <>
      <p className="wcm-hub2-intro">{monthLabel(a.period)}, synced from Google Analytics.</p>
      {withData.length > 1 && (
        <div className="home-chips" role="group" aria-label="Department">
          {withData.map((d) => (
            <button key={d.id} type="button" className={`home-chip-btn${d.id === current.id ? ' active' : ''}`} aria-pressed={d.id === current.id} onClick={() => setSelected(d.id)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="home-kpis">
        <div className="home-kpi"><b>{fmtNum(a.visitors)}</b><span>Visitors</span></div>
        {a.new_visitors !== null && <div className="home-kpi"><b>{fmtNum(a.new_visitors)}</b><span>First-time visitors</span></div>}
        {a.visits !== null && <div className="home-kpi"><b>{fmtNum(a.visits)}</b><span>Visits</span></div>}
        {a.engaged_pct !== null && <div className="home-kpi"><b>{a.engaged_pct}%</b><span>Engaged visits</span></div>}
        <div className="home-kpi"><b>{fmtDuration(a.avg_seconds)}</b><span>Average visit</span></div>
      </div>
      {a.top_pages.length > 0 && (
        <div className="home-dept">
          <h3 className="home-card-title">Most visited pages</h3>
          <div className="home-table-wrap">
            <table className="home-table">
              <thead><tr><th>Page</th><th className="num">Visits</th><th className="num">Visitors</th><th className="num">Avg. visit</th></tr></thead>
              <tbody>
                {a.top_pages.map((p) => (
                  <tr key={p.path}>
                    <td>{p.title}</td>
                    <td className="num">{fmtNum(p.visits)}</td>
                    <td className="num">{fmtNum(p.visitors)}</td>
                    <td className="num">{fmtDuration(p.avg_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function NotesTab({ notes, led }: { notes: DirectorNote[]; led: DepartmentSummary[] }) {
  if (!notes.length) {
    return (
      <div className="wcm-hub2-empty">
        Meeting notes shared with you appear here, newest first. After your department&apos;s review meeting, the recap and your playbook timeline are posted here.
      </div>
    )
  }
  return (
    <>
      <p className="wcm-hub2-intro">Meeting notes and recaps shared with you, newest first.</p>
      <div className="home-dept">
        {notes.map((n) => {
          const d = new Date(n.posted_at)
          const dept = n.department_id ? led.find((x) => x.id === n.department_id)?.name : null
          return (
            <div key={n.id} className="home-note">
              <div className="home-note-date">{d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}<b>{d.getDate()}</b></div>
              <div className="home-note-body">
                <div className="home-note-title">
                  {n.href ? <a href={n.href}>{n.title}</a> : n.title}
                </div>
                <div className="home-note-text">{n.description}{dept ? ` (${dept})` : ''}</div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function WidgetsTab({ widgets }: { widgets: WidgetItem[] }) {
  return (
    <>
      <p className="wcm-hub2-intro">Embeddable directories and tools the District Web Team builds for departments. Each one can go on any page and is kept up to date in one place.</p>
      <div className="wcm-hub2-grid">
        {widgets.map((w) => (
          <div key={w.slug} className="wcm-hub2-card">
            <h3>{w.title}</h3>
            {w.description && <p>{w.description}</p>}
            <a className="wcm-hub2-card-btn" href={w.preview_path!} target="_blank" rel="noopener noreferrer">Preview</a>
          </div>
        ))}
        <div className="wcm-hub2-card">
          <h3>Want one for your department?</h3>
          <p>Tell us what you want listed. The District Web Team builds a first version and refines it with you.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={() => openFeedback('We would like a widget for our department. What we want listed: ')}>Request a widget</button>
        </div>
      </div>
    </>
  )
}

function DirectorHelp({ myWindow, led }: { myWindow: ReviewWindow | null; led: DepartmentSummary[] }) {
  return (
    <div className="wcm-hub2-grid">
      <div className="wcm-hub2-card">
        <h3>Director Playbook</h3>
        <p>Every update for directors in one place: deadlines, the review schedule, and what is expected of your department.</p>
        <a className="wcm-hub2-card-btn" href={DIRECTOR_PLAYBOOK_URL}>Open the playbook</a>
      </div>
      <div className="wcm-hub2-card">
        <h3>Request a meeting</h3>
        <p>Want to meet before your division&apos;s window? Ask for an earlier time and we will fit you in.</p>
        <button type="button" className="wcm-hub2-card-btn" onClick={() => openFeedback(meetingMessage('earlier', led, myWindow))}>Request a meeting</button>
      </div>
      <div className="wcm-hub2-card">
        <h3>Ask the District Web Team</h3>
        <p>A question about your website, your WCM, or anything on this page? It comes straight to the team.</p>
        <button type="button" className="wcm-hub2-card-btn" onClick={() => openFeedback()}>Send a message</button>
      </div>
      <div className="wcm-hub2-card">
        <h3>Confirm or Change Your WCM</h3>
        <p>Name the Web Content Manager for your department, or let the District Web Team know about a change.</p>
        <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Open the form</a>
      </div>
    </div>
  )
}

/* ─── WCM ──────────────────────────────────────────────── */
// The WCM dashboard, laid out like the other dashboards (Sean approved,
// mock v3): tabs, then the welcome and status strip on Overview only.
// Overview opens with the first steps and Hot Labs; My Department holds the
// audit, the site's visitors and the review; Widgets is a view-only
// showroom. Maintain was dropped, Build Kit became Widgets, WCMs got the
// director's Website Review tab, and Learn folded into Tools & Resources
// (its Hot Labs tile and knowledge base) (Sean, Oct 6).
// Oct 7 (Sean): Overview is the consolidated dashboard (My Department folded
// in); Run Audit is only the audit and ADA results; Website Review is the
// process, the windows and how to work through the audit.
type WcmTab = 'overview' | 'audit' | 'review' | 'widgets' | 'tools'

function WcmHome({ data, preview, onNavigate }: { data: HomeData; preview?: boolean; onNavigate: Navigate }) {
  const [tab, setTab] = useState<WcmTab>('overview')
  const mine = data.departments
  const primary = mine[0]
  const cert = data.my_cert ?? { certified: !!data.my_certified, done: 0, total: 0, pct: data.my_certified ? 100 : 0 }
  const w = primary ? windowForDivision(primary.division) : null
  const open = mine.reduce((n, d) => n + d.findings_open, 0)
  const fixed = mine.reduce((n, d) => n + d.findings_fixed, 0)
  const name = firstName(data)
  const tabs: { id: WcmTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(mine.length ? [{ id: 'audit' as WcmTab, label: 'Run Audit' }] : []),
    ...(mine.length ? [{ id: 'review' as WcmTab, label: 'Website Review' }] : []),
    { id: 'widgets', label: 'Widgets' },
    { id: 'tools', label: 'Tools & Resources' },
  ]
  return (
    <div className="home">
      {preview && <PreviewBanner who="WCM" />}
      <HomeTabs tabs={tabs} active={tab} onChange={(x) => setTab(x as WcmTab)} />
      {tab === 'overview' && <>
      <div className="home-hero">
        <div className="home-hero-label">BCPS MarComm Web Content Manager</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        <p>Your certification, your department&apos;s website, and everything you need to keep it current.</p>
        <div className="home-actions">
          {cert.certified
            ? <a className="home-btn" href="/briefs/bcps-wcm-cert-complete-2026-27">Certified: what&apos;s next</a>
            : <a className="home-btn" href="/certification/departments/dashboard">{cert.pct > 0 ? 'Continue certification' : 'Start certification'}</a>}
          <a className="wcm-hub2-card-btn" href="/playbooks/wcm-department">Department WCM Playbook</a>
        </div>
      </div>

      <div className="home-strip">
        <StatTile
          label="Certification"
          value={cert.certified ? 'Certified' : `${cert.pct}%`}
          note={cert.certified ? 'Department WCM Certification complete' : `${cert.total ? `${cert.done} of ${cert.total} pages. ` : ''}Due ${DEPT_CERT_DEADLINE}.`}
          tone={cert.certified ? undefined : 'warn'}
          icon={cert.certified ? CERT_SHIELD_SRC : undefined}
          link={cert.certified ? { label: 'Certificate and badge', href: '/certification/departments/complete' } : { label: cert.pct > 0 ? 'Continue certification' : 'Start certification', href: '/certification/departments/dashboard' }}
        />
        {w && <StatTile label="Your review window" value={formatWindowRange(w)} note={`${w.label}. Bring your director.`}
          link={mine.length ? { label: 'How the review works', onClick: () => setTab('review') } : undefined} />}
        {mine.length > 0 && (
          <StatTile
            label="Audit items to fix"
            value={open ? `${open} open` : open + fixed ? 'All fixed' : 'None yet'}
            note={open + fixed ? `${fixed} already fixed` : 'Your audit items will show here'}
            tone={open ? 'warn' : undefined}
            link={{ label: 'Open Run Audit', onClick: () => setTab('audit') }}
          />
        )}
        <StatTile label="Next Hot Lab" value={hotLabLive() ? 'Live now' : nextHotLab()} note="Tuesdays and Thursdays, 11:30 AM"
          link={{ label: hotLabLive() ? 'Join now' : 'Join on Teams', href: HOT_LAB_JOIN_URL, external: true }} />
      </div>
      </>}

      {tab === 'overview' && (
        <>
          <div className="home-wcm-cols home-section">
          <div className="home-wcm-main">
          <div className="home-dept home-section">
            <h3 className="home-card-title">Your next steps</h3>
            <ol className="home-wsteps">
              <li className={cert.certified ? 'done' : 'now'}>
                <b>Finish your certification</b>
                <span>{cert.certified ? 'Done. Your certificate and what comes next are on the What\u2019s Next page.' : `The Department WCM Certification is due ${DEPT_CERT_DEADLINE}. It covers how the audit works.`}</span>
                {!cert.certified && <a className="wcm-hub2-card-btn" href="/certification/departments/dashboard">Open certification</a>}
              </li>
              {mine.length > 0 && (
                <li>
                  <b>Work through your audit</b>
                  <span>Run Audit shows your page with every check pinned on it: green passes, red needs a fix, amber needs you to look. Website Review walks you through it.</span>
                  <button type="button" className="home-link-btn" onClick={() => setTab('audit')}>Go to Run Audit</button>
                </li>
              )}
            </ol>
          </div>
          <HotLabCard items={data.hot_labs ?? []} />
          </div>
          <div className="home-wcm-side"><WcmHubCards tab="start" certified={cert.certified} /></div>
          </div>
          {mine.map((d) => <WcmDepartmentCards key={d.id} dept={d} showName={mine.length > 1} onAudit={() => setTab('audit')} />)}
        </>
      )}
      {tab === 'widgets' && <WidgetsTab widgets={data.widgets ?? []} />}
      {tab === 'audit' && <RunAuditTab depts={mine} canRecheck />}
      {tab === 'review' && <>
        {mine.map((d) => <WcmAuditSteps key={d.id} dept={d} showName={mine.length > 1} onAudit={() => setTab('audit')} />)}
        <ReviewTab led={mine} myWindow={primaryWindow(mine)} />
      </>}
      {tab === 'tools' && <ToolsPanel kind="wcm" onNavigate={onNavigate} kb={data.kb_articles ?? []} hotLabs={data.hot_labs ?? []} />}
    </div>
  )
}

// Run Audit tab (Sean, 2026-10-07): only the audit, for the whole department
// site. The page list with scores, the chosen page with every check pinned,
// and the ADA results from the same run (components/bcps/SiteAudit). The
// department's WCM can run the audit again on a page; directors read only
// (the API decides who may run).
function RunAuditTab({ depts }: { depts: DepartmentSummary[]; canRecheck?: boolean }) {
  const [pick, setPick] = useState(depts[0]?.id ?? '')
  const dept = depts.find((d) => d.id === pick) ?? depts[0]
  if (!dept) return null
  return (
    <div className="home-section">
      {depts.length > 1 && (
        <div className="home-dept home-section" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            Department
            <select value={dept.id} onChange={(e) => setPick(e.target.value)} style={{ font: 'inherit', padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,.15)' }}>
              {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>
      )}
      <SiteAudit key={dept.id} owner={{ department_id: dept.id }} />
    </div>
  )
}

// Overview: one department at a glance (formerly My Department).
function WcmDepartmentCards({ dept, showName, onAudit }: { dept: DepartmentSummary; showName: boolean; onAudit: () => void }) {
  const s = dept.audit_status || 'not_started'
  const w = windowForDivision(dept.division)
  const a = dept.analytics
  const wr = dept.web_review
  return (
    <div className="home-section">
      {showName && <h3 className="home-grp">{dept.name}</h3>}
      <div className="home-dept-grid home-section">
        <div className="home-dept">
          <div className="home-dept-head"><h3>Your audit</h3><span className="home-chip">{AUDIT_LABELS[s] || s}</span></div>
          <p className="home-card-text">{wr ? `${wr.checks_passed ?? 0} checks pass, ${wr.checks_failed ?? 0} to fix, ${wr.checks_review ?? 0} to review.` : 'Your audit results show here after your page is audited.'}</p>
          <button type="button" className="home-btn" onClick={onAudit}>Open Run Audit</button>
        </div>
        <div className="home-dept">
          <h3 className="home-card-title">{a ? `${monthLabel(a.period).split(' ')[0]} visitors` : 'Visitors'}</h3>
          {a ? (
            <div className="home-kpis">
              <div className="home-kpi"><b>{fmtNum(a.visitors)}</b><span>Visitors</span></div>
              {a.engaged_pct !== null && <div className="home-kpi"><b>{a.engaged_pct}%</b><span>Engaged visits</span></div>}
            </div>
          ) : <p className="home-card-text">Visitor numbers for your pages are not connected yet.</p>}
        </div>
        <div className="home-dept">
          <h3 className="home-card-title">Your review</h3>
          <p className="home-card-text">{w ? `${w.label}, ${formatWindowRange(w)}. Work through your audit first, then bring your director to the one-hour meeting.` : 'Work through your audit first, then bring your director to the one-hour meeting.'}</p>
        </div>
      </div>
    </div>
  )
}

// Website Review: how to work through the audit, step by step.
function WcmAuditSteps({ dept, showName, onAudit }: { dept: DepartmentSummary; showName: boolean; onAudit: () => void }) {
  const s = dept.audit_status || 'not_started'
  const w = windowForDivision(dept.division)
  const steps: { title: string; body: string; done: boolean; action?: React.ReactNode }[] = [
    { title: 'Run your audit', body: 'Open Run Audit. Your page appears with a numbered pin on every check: green passes, red needs a fix, amber needs you to look.', done: !!dept.web_review, action: <button type="button" className="wcm-hub2-card-btn" onClick={onAudit}>Open Run Audit</button> },
    { title: 'Fix the red items', body: 'Click a red check to see where it is on your page, why it matters and the steps in Finalsite. Each one links to the course page that teaches it.', done: !!dept.web_review && (dept.web_review.checks_failed ?? 1) === 0 },
    { title: 'Look at the amber items', body: 'Amber items need a person to look, like whether an image is a flyer or a PDF is tagged. They never lower your score.', done: false },
    { title: 'Run the audit again', body: 'After you fix something in Finalsite, run the audit again (up to 3 times a day) and watch the checks turn green.', done: !!dept.web_review && (dept.web_review.checks_failed ?? 1) === 0 },
    { title: 'Submit for review', body: 'When every red item is fixed, submit your audit. The District Web Team checks the fixes.', done: ['wcm_submitted', 'admin_review', 'complete'].includes(s), action: <a className="wcm-hub2-card-btn" href="/wcm-portal">Submit in my audit</a> },
    { title: 'Bring your director to the review', body: w ? `${dept.division} is in ${w.label}, ${formatWindowRange(w)}. Your director books the one-hour meeting.` : 'Your director books the one-hour review meeting with the District Web Team.', done: s === 'complete' },
  ]
  const current = steps.findIndex((x) => !x.done)
  return (
    <div className="home-dept home-section">
      <h3 className="home-card-title">{showName ? `${dept.name}: your audit, step by step` : 'Your audit, step by step'}</h3>
      <ol className="home-wsteps">
        {steps.map((x, i) => (
          <li key={x.title} className={x.done ? 'done' : i === current ? 'now' : undefined}>
            <b>{x.title}</b>
            <span>{x.body}</span>
            {i === current && x.action}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ─── SIGNED IN, NO ROLE YET ──────────────────────────── */
// Not on the District Web Team, not matched as a director, not a WCM. Most
// often a director whose department has no director email on file yet, or a
// WCM whose director has not confirmed them. Only cards they can open.
function MemberHome({ data, onNavigate }: { data: HomeData; onNavigate: Navigate }) {
  const name = firstName(data)
  return (
    <div className="home">
      <div className="home-hero">
        <div className="home-hero-label">BCPS MarComm</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome to BCPS MarComm'}</h1>
        <p>Your account is not connected to a department yet. Once it is, this page shows your department&apos;s website team, certification and review status.</p>
      </div>
      <div className="wcm-hub2-grid">
        <div className="wcm-hub2-card">
          <h3>Are You a Director?</h3>
          <p>Confirm your department&apos;s Web Content Manager. If this page still does not show your department afterward, let the District Web Team know which department you lead.</p>
          <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Confirm your WCM</a>
        </div>
        <div className="wcm-hub2-card">
          <h3>Director Playbook</h3>
          <p>How the Web Content Manager program works and what is expected of each department.</p>
          <a className="wcm-hub2-card-btn" href={DIRECTOR_PLAYBOOK_URL}>Open the playbook</a>
        </div>
        <div className="wcm-hub2-card">
          <h3>Ask the District Web Team</h3>
          <p>Not sure why you are seeing this page? Send a message and the team will connect your account.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={() => openFeedback()}>Send a message</button>
        </div>
      </div>
      <h2 className="home-grp">Tools &amp; Resources</h2>
      <ToolsPanel kind="member" onNavigate={onNavigate} hotLabs={data.hot_labs ?? []} />
    </div>
  )
}

/* ─── SCHOOL WCM ─────────────────────────────────────── */
// School Web Content Managers (Sean + Vanessa Deslandes, 2026-10-05). For now
// their only job here is their school's homepage banner, so the home is just
// that: what is waiting on the District Web Team, and the way in to submit.
// Kept deliberately small; add a card only when its link works for a school.

const BANNER_GUIDELINES_URL =
  'https://www.browardschools.com/wcm-community/schools/standards-guidelines/website-guidelines/homepage/identity-homepage-banner'

// Tiles are things a school WCM does inside BCPS MarComm; Quick Links are
// outside sites, each opening in a new tab (Sean + Vanessa Deslandes,
// 2026-10-05). Links supplied by Sean the same day.
const SCHOOL_QUICK_LINKS: { label: string; sub: string; href: string; ic: string }[] = [
  { label: 'Identity Banner Guidelines', sub: 'What makes a banner approvable', href: BANNER_GUIDELINES_URL, ic: 'IB' },
  { label: 'Proud Points Guidelines', sub: 'How to write your six homepage highlights', href: 'https://www.browardschools.com/wcm-community/schools/standards-guidelines/website-guidelines/homepage/proud-points', ic: 'PP' },
  { label: 'WCM Community', sub: 'Details and support for Web Content Managers', href: 'https://www.browardschools.com/wcm-community', ic: 'WC' },
  { label: 'Submit a ticket (IIQ)', sub: 'Questions and help requests, IncidentIQ', href: 'https://browardschools.incidentiq.com/', ic: 'IQ' },
  { label: 'Finalsite dashboard', sub: 'Sign in to edit your school website', href: 'https://www.browardschools.com/fs/admin', ic: 'FS' },
]

function SchoolWcmHome({ data, preview, onNavigate }: { data: HomeData; preview?: boolean; onNavigate: Navigate }) {
  const name = firstName(data)
  const schools = (data.schools ?? []).map((x) => x.name)
  const schoolLabel = schools.length ? schools.join(', ') : 'your school'
  // Counts cover every submission type (banners and Proud Points), the same
  // way Your Submissions lists them together (Vanessa Deslandes, 2026-10-08).
  const bn = data.my_banners ?? { pending: 0, ready: 0, posted: 0, rejected: 0 }
  const pp = data.my_proud_points ?? { pending: 0, ready: 0, posted: 0, rejected: 0, drafts: 0 }
  const b = { pending: bn.pending + pp.pending, ready: bn.ready + pp.ready, posted: bn.posted + pp.posted, rejected: bn.rejected + pp.rejected }
  const openBanners = () => onNavigate('banner-submissions')
  const openProudPoints = () => onNavigate('proud-points')
  return (
    <div className="home">
      {preview && <PreviewBanner who="School WCM">
        <strong>Previewing the School WCM dashboard</strong> with a sample person and school. Every link and button is the real one.
      </PreviewBanner>}
      <div className="home-hero">
        <div className="home-hero-label">BCPS MarComm School Web Content Manager</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        <p>Homepage banners and Proud Points for {schoolLabel}. Submit them here and follow each one through District Web Team review.</p>
        <div className="home-actions">
          <button type="button" className="home-btn" onClick={openBanners}>Submit a banner</button>
          <button type="button" className="home-btn" onClick={openProudPoints}>Submit Proud Points</button>
        </div>
      </div>

      <div className="home-strip">
        <StatTile label="Waiting for review" value={b.pending} note="The District Web Team checks each one by eye." />
        <StatTile label="Approved" value={b.ready} note="The web team posts it and emails you when it is live." />
        <StatTile label="Live on your site" value={b.posted} />
        <StatTile label="Not approved" value={b.rejected} note={b.rejected ? 'See the reason under Your Submissions.' : undefined} tone={b.rejected ? 'warn' : undefined} />
      </div>

      <div className="wcm-hub2-grid">
        <div className="wcm-hub2-card">
          <h3>Submit a Homepage Banner</h3>
          <p>Upload a photo or video, check it in the live preview of your homepage, and send it for review. One banner is all you need; you can add up to three.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={openBanners}>Open Banner Submissions</button>
        </div>
        <div className="wcm-hub2-card">
          <h3>Submit Proud Points</h3>
          <p>{pp.drafts ? 'You have a draft in progress. ' : ''}The six highlights on your homepage: a data point, heading, caption and photo for each. Replace one at a time once your six are up.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={openProudPoints}>{pp.drafts ? 'Continue your draft' : 'Open Proud Points'}</button>
        </div>
        <div className="wcm-hub2-card">
          <h3>Your Submissions</h3>
          <p>Every banner and Proud Point you have sent, where it stands, and the reason if one was not approved.</p>
          <a className="wcm-hub2-card-btn" href="/?page=my-submissions">View my submissions</a>
        </div>
        {/* Coming soon (Sean, 2026-10-05): the one deliberate exception to
            "a card only appears when its link works", so schools see what is
            next. Not clickable. */}
        <div className="wcm-hub2-card" aria-disabled="true" style={{ background: '#f7f9fb', borderStyle: 'dashed' }}>
          <h3>ADA Compliance <span className="home-status todo" style={{ marginLeft: 6, verticalAlign: 'middle' }}>Coming soon</span></h3>
          <p>Accessibility scan results for your school website, with what to fix and how.</p>
        </div>
      </div>

      <h2 className="home-grp">Quick Links</h2>
      <div className="home-tools">
        {SCHOOL_QUICK_LINKS.map((l) => (
          <a key={l.href} className="home-tool" href={l.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <span className="home-tool-ic" aria-hidden="true">{l.ic}</span>
            <span style={{ minWidth: 0 }}>
              <b>{l.label}</b>
              <small>{l.sub} <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span></small>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

/* ─── DISTRICT WEB TEAM AND SUPERADMIN ────────────────── */
// Two web team views plus the SuperAdmin's (Sean, 2026-10-01, mock v3). The
// team members also in the Office of Communications group work the
// department side ('comms'); Application Services ('appsvc') works ADA,
// schools and tools. Everyone on the team sees the program numbers, ADA,
// banners and widgets. Decisions, the Team tab, Admin and Team Operations
// are the SuperAdmin's.

type TeamKind = 'comms' | 'appsvc'

// Hot Lab is live Tuesdays and Thursdays, 11:30 AM to 12:30 PM Eastern.
function hotLabLive(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const mins = Number(get('hour')) * 60 + Number(get('minute'))
  return (get('weekday') === 'Tue' || get('weekday') === 'Thu') && mins >= 11 * 60 + 30 && mins < 12 * 60 + 30
}

// The WCM's Hot Lab card: times, a Live badge while a session runs, and the
// latest notes they can open (Sean, Oct 6 Hot Lab).
function HotLabCard({ items }: { items: { title: string; date: string; url: string }[] }) {
  const live = hotLabLive()
  return (
    <div className="home-dept home-section">
      <div className="home-dept-head">
        <h3>Hot Lab</h3>
        {live && <span className="home-live-pill">Live now</span>}
      </div>
      <p className="home-card-text">Tuesdays and Thursdays, 11:30 AM to 12:30 PM on Teams. Bring a page, a task or a question.</p>
      <a className="home-btn" href={HOT_LAB_JOIN_URL} target="_blank" rel="noopener noreferrer">{live ? 'Join the Hot Lab now' : 'Join on Teams'}</a>
      {items.length > 0 && (
        <ul className="home-hotlab-list">
          {items.map((h) => <li key={h.url}><a href={h.url}>{h.date}</a></li>)}
        </ul>
      )}
      <a className="home-link-btn" href="/?page=notes">All meeting notes</a>
    </div>
  )
}

function nextHotLab(today: Date = new Date()): string {
  // Department WCM Hot Labs run Tuesdays and Thursdays.
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (d.getDay() === 2 || d.getDay() === 4) {
      return i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }
  }
  return 'Tuesdays and Thursdays'
}

function currentWindow(): ReviewWindow {
  return REVIEW_WINDOWS.find((w) => windowState(w) === 'open')
    ?? REVIEW_WINDOWS.find((w) => windowState(w) === 'upcoming')
    ?? REVIEW_WINDOWS[REVIEW_WINDOWS.length - 1]
}

function BarRow({ label, value, total, tone }: { label: string; value: number; total: number; tone?: 'green' }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div className="home-barrow">
      <span>{label}</span>
      <div className={`home-bar${tone ? ` ${tone}` : ''}`} role="img" aria-label={`${value} of ${total}`}><div style={{ width: `${pct}%` }} /></div>
      <span className="home-barrow-n">{value} / {total}</span>
    </div>
  )
}

function ProgramPanel({ p }: { p: TeamProgram }) {
  return (
    <>
      <p className="wcm-hub2-intro">The whole program at a glance. Everyone on the District Web Team sees this tab.</p>
      <div className="home-dept-grid">
        <div className="home-dept">
          <h3 className="home-card-title">Certification by division</h3>
          <p className="home-card-text">Rostered department WCMs certified, due {DEPT_CERT_DEADLINE}.</p>
          {p.certification.map((c) => <BarRow key={c.division} label={c.division} value={c.certified} total={c.wcms} />)}
        </div>
        <div className="home-dept">
          <h3 className="home-card-title">Director launch</h3>
          <p className="home-card-text">Directors on file and how many have signed in.</p>
          <div className="home-kpis">
            <div className="home-kpi"><b>{p.directors_on_file}</b><span>Directors on file</span></div>
            <div className="home-kpi"><b>{p.directors_signed_in}</b><span>Signed in</span></div>
            <div className="home-kpi"><b>{p.departments_with_wcm} of {p.departments_total}</b><span>Departments with a WCM</span></div>
          </div>
        </div>
        <div className="home-dept">
          <h3 className="home-card-title">Review windows</h3>
          <p className="home-card-text">Departments with a signed-off review this school year.</p>
          {p.windows.map((w) => {
            const win = REVIEW_WINDOWS.find((x) => x.id === w.id)!
            const s = windowState(win)
            return <BarRow key={w.id} label={`${win.label} · ${s === 'open' ? 'open' : s === 'closed' ? 'finished' : formatWindowDate(win.start)}`} value={w.signed_off} total={w.departments} tone="green" />
          })}
          <p className="home-card-text home-gap">{p.open_findings} audit finding{p.open_findings === 1 ? ' is' : 's are'} open across all department sites.</p>
        </div>
      </div>
    </>
  )
}

function AdaPanel({ ada, onNavigate }: { ada: TeamAda; onNavigate: (page: PageId) => void }) {
  return (
    <>
      <p className="wcm-hub2-intro">Accessibility across department sites. Wave is the ADA standard; results separate what a WCM can fix from what Finalsite has to fix.</p>
      <div className="home-kpis">
        <div className="home-kpi"><b>{ada.average_score ?? '-'}</b><span>Average ADA score, department sites</span></div>
        <div className="home-kpi"><b>{ada.sites_scanned}</b><span>Department sites scanned</span></div>
        <div className="home-kpi"><b>{ada.scans_30d}</b><span>Scans in the last 30 days</span></div>
        {ada.last_scan && <div className="home-kpi"><b>{new Date(ada.last_scan).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b><span>Most recent scan</span></div>}
      </div>
      <div className="wcm-hub2-grid">
        <div className="wcm-hub2-card">
          <h3>ADA Scanner</h3>
          <p>Scan any page and see every issue, in plain language.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('ada-scanner')}>Open ADA Scanner</button>
        </div>
        <div className="wcm-hub2-card">
          <h3>ADA Manager</h3>
          <p>Full-site school scans and per-page issue detail.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('ada-manager')}>Open ADA Manager</button>
        </div>
        {ada.lowest.length > 0 && (
          <div className="wcm-hub2-card">
            <h3>Lowest scoring sites</h3>
            <ul className="home-mini">
              {ada.lowest.map((l) => <li key={l.department}><span>{l.department}</span><b>{l.score}</b></li>)}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

// The Banners tab covers every school homepage submission: banners and,
// since 2026-10-08, Proud Points.
function BannersPanel({ b, pp, onNavigate }: { b: TeamBanners; pp?: TeamBanners & { ready: number }; onNavigate: (page: PageId) => void }) {
  return (
    <>
      <p className="wcm-hub2-intro">Banner submissions from WCMs. Approving and rejecting happens in the Banner Submissions tool.</p>
      <div className="home-dept">
        <div className="home-dec">
          <div className="home-dec-what">{b.pending} waiting for review<small>Submitted through the Banner Submission tool.</small></div>
          <button type="button" className="home-btn" onClick={() => onNavigate('banner-submissions')}>Open Banner Submissions</button>
        </div>
        <div className="home-dec">
          <div className="home-dec-what">{b.approved} approved, {b.rejected} rejected<small>The full history stays in the tool.</small></div>
        </div>
        {pp && (
          <div className="home-dec">
            <div className="home-dec-what">Proud Points: {pp.pending} waiting for review, {pp.ready} approved and not posted<small>Post in Finalsite, then Mark posted to email the WCM.</small></div>
            <button type="button" className="home-btn" onClick={() => onNavigate('proud-points')}>Open Proud Points</button>
          </div>
        )}
      </div>
    </>
  )
}

function MyWorkPanel({ items, who, onNavigate }: { items: Assignment[]; who?: string; onNavigate: (page: PageId) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 10)
  if (!items.length) {
    return <div className="wcm-hub2-empty">{who ? `${who} has` : 'You have'} no open rows on the Web Team Assignments page.</div>
  }
  return (
    <>
      <p className="wcm-hub2-intro">{who ? `${who}’s` : 'Your'} rows from the Web Team Assignments page, soonest date first.</p>
      <div className="home-dept">
        <div className="home-table-wrap">
          <table className="home-table">
            <thead><tr><th>Assignment</th><th>Role</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.slug}>
                  <td>{a.title}</td>
                  <td><span className={`home-tag ${a.role}`}>{a.role === 'lead' ? 'Lead' : 'Support'}</span></td>
                  <td>{STATUS_LABELS[a.status] || a.status}</td>
                  <td>{a.date_label || 'Not set'}{a.past_date && <span className="home-tag late">Past date</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="home-actions">
          {items.length > 10 && (
            <button type="button" className="wcm-hub2-card-btn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>
          )}
          <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('bcps-assignments')}>Open Web Team Assignments</button>
        </div>
      </div>
    </>
  )
}

const STATUS_LABELS: Record<string, string> = { 'in-progress': 'In Progress', pending: 'Pending', ongoing: 'Ongoing', completed: 'Completed' }

// Audits: every department site's audit in one place, so the team can track
// it (Sean, 2026-10-01; replaced the Review Window tab). Status comes from
// the audit workflow (bcps_departments.audit_status), findings from
// bcps_audit_findings, the score from the latest scan.
const AUDIT_GROUPS: { id: string; label: string; statuses: (string | null)[] }[] = [
  { id: 'action', label: 'With the WCM', statuses: ['wcm_notified', 'needs_rework'] },
  { id: 'review', label: 'Waiting on us', statuses: ['wcm_submitted', 'admin_review'] },
  { id: 'progress', label: 'Audit in progress', statuses: ['in_progress'] },
  { id: 'none', label: 'Not started', statuses: ['not_started', null] },
  { id: 'done', label: 'Complete', statuses: ['complete'] },
]

// View a scan (Sean, 2026-10-08): pull up any audited site's scan from the
// Audits tab, the department sites and the school sites, to walk WCMs or a
// school team through how a scan looks.
function ScanShowcase() {
  const [sites, setSites] = useState<{ kind: 'department' | 'school'; id: string; name: string; pages: number }[] | null>(null)
  const [pick, setPick] = useState('')
  useEffect(() => {
    (async () => {
      const { data } = await createClient().auth.getSession()
      const t = data.session?.access_token
      const res = await fetch('/api/bcps/site-audit?list=1', { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      const json = await res.json().catch(() => ({}))
      setSites(res.ok ? json.sites ?? [] : [])
    })()
  }, [])
  const site = sites?.find((x) => x.id === pick) ?? null
  return (
    <div className="home-section">
      <div className="home-dept home-section" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>View a scan</h3>
        <select aria-label="Pick a site" value={pick} onChange={(e) => setPick(e.target.value)} style={{ font: 'inherit', padding: '7px 10px', borderRadius: 8, border: '1px solid #1672A7', minWidth: 260, maxWidth: '100%' }}>
          <option value="">{sites ? (sites.length ? 'Pick a department or school…' : 'No sites audited yet') : 'Loading…'}</option>
          {(['department', 'school'] as const).map((k) => sites?.some((x) => x.kind === k) ? (
            <optgroup key={k} label={k === 'department' ? 'Department sites' : 'School sites (ADA only)'}>
              {sites.filter((x) => x.kind === k).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.pages} pages)</option>)}
            </optgroup>
          ) : null)}
        </select>
        {site && <button type="button" className="home-link-btn" onClick={() => setPick('')}>Close</button>}
        <span className="home-card-text" style={{ margin: 0 }}>Shows the scan exactly as the WCM sees it.</span>
      </div>
      {site && <SiteAudit key={site.id} owner={site.kind === 'department' ? { department_id: site.id } : { school_id: site.id }} adaOnly={site.kind === 'school'} isAdmin />}
    </div>
  )
}

function AuditsPanel({ depts, onNavigate }: { depts: DepartmentSummary[]; onNavigate: Navigate }) {
  const [group, setGroup] = useState<string>('all')
  const [q, setQ] = useState('')
  const counts = AUDIT_GROUPS.map((g) => ({ ...g, n: depts.filter((d) => g.statuses.includes(d.audit_status ?? null)).length }))
  const shown = depts
    .filter((d) => group === 'all' || AUDIT_GROUPS.find((g) => g.id === group)!.statuses.includes(d.audit_status ?? null))
    .filter((d) => !q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <ScanShowcase />
      <p className="wcm-hub2-intro">Every department site&apos;s audit, from first scan to sign-off. Pick a group to see who is up next.</p>
      <div className="home-kpis">
        {counts.map((c) => (
          <button key={c.id} type="button" className={`home-kpi home-kpi-btn${group === c.id ? ' active' : ''}`} aria-pressed={group === c.id} onClick={() => setGroup(group === c.id ? 'all' : c.id)}>
            <b>{c.n}</b><span>{c.label}</span>
          </button>
        ))}
      </div>
      <div className="home-dept">
        <div className="home-actions home-actions-tight home-audit-tools">
          <label className="sr-only" htmlFor="audit-search">Search departments</label>
          <input id="audit-search" type="search" className="home-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search departments" />
          {group !== 'all' && <button type="button" className="home-link-btn" onClick={() => setGroup('all')}>Show all {depts.length}</button>}
          <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('departments')}>Open Departments</button>
        </div>
        <div className="home-table-wrap">
          <table className="home-table">
            <thead><tr><th>Department</th><th>Status</th><th className="num">Open</th><th className="num">Fixed</th><th className="num">ADA score</th><th className="num">Last audit</th></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}<span className="home-wcm-sub">{d.division}</span></td>
                  <td>{AUDIT_LABELS[d.audit_status || 'not_started'] || d.audit_status}</td>
                  <td className="num">{d.findings_open}</td>
                  <td className="num">{d.findings_fixed}</td>
                  <td className="num">{d.ada_score ?? '-'}</td>
                  <td className="num">{d.audit_date ? new Date(d.audit_date + (d.audit_date.length <= 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <p className="home-card-text">No departments match.</p>}
      </div>
    </>
  )
}

type HotLabLink = { title: string; date: string; url: string }

// Tools & Resources (Sean, 2026-10-06 Hot Lab): search first. With no
// search, a grid of tiles: your tools (most used, plus Ask a question and
// Suggest a Hot Lab topic), Hot Labs (the latest sessions), then one tile per
// knowledge base topic. Typing turns the grid into a filterable portfolio of
// every tool, article and Hot Lab that matches, exact matches first, then
// close ones. "Tools and apps" articles are covered by the tool tiles, so they
// only show up in search.
function ToolsPanel({ kind, onNavigate, kb = [], hotLabs = [] }: { kind: keyof typeof TOP_TOOLS; onNavigate: (page: PageId) => void; kb?: KbArticle[]; hotLabs?: HotLabLink[] }) {
  const { pages, role, viewAs } = useBCPSShell()
  const [q, setQ] = useState('')
  const isSA = role === 'superadmin' && (!viewAs || viewAs.id === SAMPLE_SUPERADMIN_ID)
  // Same rule as the left menu: the page set in force decides, and a
  // SuperAdmin always reaches the SuperAdmin-only consoles.
  const canOpen = (t: Tool) => pages
    ? pages.includes(t.gate) || (isSA && SUPERADMIN_PAGES_SET.has(t.gate))
    : isSA || !SUPERADMIN_PAGES_SET.has(t.gate)
  const mine = TOOLS.filter(canOpen)
  const top = TOP_TOOLS[kind].map((l) => mine.find((t) => t.label === l)).filter((t): t is Tool => !!t)
  const open = (t: Tool) => { if (t.page) onNavigate(t.page); else if (t.href) window.location.href = t.href }

  type Item = { key: string; kind: string; title: string; desc: string; text: string; icon?: React.ReactNode; go: () => void }
  const items: Item[] = [
    ...mine.map((t) => ({ key: `t:${t.label}`, kind: 'Tool', title: t.label, desc: t.desc, text: `${t.label} ${t.desc} ${t.group}`, icon: Icons[t.icon ?? t.page ?? t.gate] ?? t.label[0], go: () => open(t) })),
    ...kb.map((a) => ({ key: `a:${a.id}`, kind: a.topic, title: a.title, desc: a.summary, text: `${a.title} ${a.summary} ${a.topic}`, go: () => { window.location.href = a.href } })),
    ...hotLabs.map((h) => ({ key: `h:${h.url}`, kind: 'Hot Lab', title: h.title, desc: 'Notes and recording', text: `hot lab ${h.title} ${h.date} notes recording`, go: () => { window.location.href = h.url } })),
    { key: 'x:ask', kind: 'Ask', title: 'Ask a question', desc: 'Can\u2019t find it? Ask, and the answer can become the next article.', text: 'ask a question help support', go: () => openFeedback('Question for the knowledge base: ') },
    { key: 'x:topic', kind: 'Ask', title: 'Suggest a Hot Lab topic', desc: 'Something to walk through together.', text: 'suggest a hot lab topic idea', go: () => openFeedback('Hot Lab topic suggestion: ') },
  ]
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const exact = searching ? items.filter((i) => words.every((w) => i.text.toLowerCase().includes(w))) : []
  // Close matches: any word of 3+ letters, or its first 4 letters, appears.
  const close = searching ? items.filter((i) => !exact.includes(i) && words.some((w) => w.length >= 3 && (i.text.toLowerCase().includes(w) || (w.length > 4 && i.text.toLowerCase().includes(w.slice(0, 4)))))) : []

  const tile = (i: Item) => (
    <button key={i.key} type="button" className="home-ptile" onClick={i.go}>
      {i.icon && <span className="home-tool-ic" aria-hidden="true">{i.icon}</span>}
      <span><small className="home-ptile-kind">{i.kind}</small><b>{i.title}</b><small>{i.desc}</small></span>
    </button>
  )

  return (
    <>
      <div className="home-tsearch home-tsearch-top">
        <label htmlFor={`tool-search-${kind}`}>Find a tool or article</label>
        <input id={`tool-search-${kind}`} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a word, like banner, roster or Hot Lab" />
      </div>

      {searching ? (
        <div aria-live="polite">
          {exact.length > 0 && <div className="home-portfolio">{exact.map(tile)}</div>}
          {close.length > 0 && (
            <>
              <h3 className="home-grp">{exact.length ? 'Close matches' : 'Nothing exact. Close matches'}</h3>
              <div className="home-portfolio">{close.map(tile)}</div>
            </>
          )}
          {!exact.length && !close.length && (
            <p className="home-hint">Nothing by that name. Try another word, or <button type="button" className="home-link-btn" onClick={() => openFeedback(`Looking for: ${q.trim()}. `)}>ask us</button>.</p>
          )}
        </div>
      ) : (
        <>
          {/* Sean, Oct 7: every tool as a large tile, four to a row. */}
          <h3 className="home-grp">Your tools</h3>
          <div className="home-tiles4">
            {top.map((t) => tile({ key: `top:${t.label}`, kind: t.group, title: t.label, desc: t.desc, text: '', icon: Icons[t.icon ?? t.page ?? t.gate] ?? t.label[0], go: () => open(t) }))}
            {tile({ key: 'top:ask', kind: 'Ask', title: 'Ask a question', desc: 'Can\u2019t find it? Ask, and the answer can become the next article.', text: '', icon: '?', go: () => openFeedback('Question for the knowledge base: ') })}
            {tile({ key: 'top:topic', kind: 'Ask', title: 'Suggest a Hot Lab topic', desc: 'Something to walk through together.', text: '', icon: '+', go: () => openFeedback('Hot Lab topic suggestion: ') })}
          </div>
          <h3 className="home-grp">Hot Labs and guides</h3>
          <div className="home-tiles4">
            {hotLabs.slice(0, 3).map((h) => tile({ key: `hl:${h.url}`, kind: 'Hot Lab', title: h.date, desc: 'Notes and recording', text: '', go: () => { window.location.href = h.url } }))}
            {tile({ key: 'hl:all', kind: 'Hot Labs', title: 'See all Hot Labs', desc: 'Every session, with notes and the recording', text: '', go: () => { window.location.href = '/?page=notes' } })}
            {kb.filter((a) => a.topic !== 'Tools and apps').map((a) => tile({ key: `kb:${a.id}`, kind: a.topic, title: a.title, desc: a.summary, text: '', go: () => { window.location.href = a.href } }))}
          </div>
        </>
      )}

      <details className="home-browse">
        <summary>Browse every tool ({mine.length})</summary>
        {TOOL_GROUPS.map((g) => {
          const list = mine.filter((t) => t.group === g)
          if (!list.length) return null
          return (
            <div key={g} className="home-bgroup">
              <h4>{g}</h4>
              <p>{list.map((t, i) => (
                <span key={t.label}>{i > 0 && ' · '}<button type="button" className="home-link-btn" onClick={() => open(t)}>{t.label}</button></span>
              ))}</p>
            </div>
          )
        })}
      </details>
    </>
  )
}

interface InboxMessage {
  id: string
  created_at: string
  email: string | null
  page: string | null
  message: string
  read_at: string | null
  admin_reply: string | null
  replied_at: string | null
}

// Decisions: everything waiting on the SuperAdmin in three groups (Sean,
// 2026-10-01): decisions to make, the inbox (site feedback, questions and
// director meeting requests, answered right here), and their own tasks
// from Web Team Assignments that are past their date or pending.
function DecisionsPanel({ th, team, onNavigate, onOpenOps, onOpenInbox }: { th: TeamHomeData; team: HomeData['team']; onNavigate: Navigate; onOpenOps: () => void; onOpenInbox: () => void }) {
  const roster = th.decisions?.roster_pending ?? []
  return (
    <>
      <p className="wcm-hub2-intro">Everything waiting on you, in one place: decisions to make, your inbox, and your own tasks.</p>
      {/* Three columns on desktop, stacked below (Sean, 2026-10-01). */}
      <div className="home-dcols">
      <section className="home-dcol" aria-label="Decide">
      <h3 className="home-grp">Decide</h3>
      <div className="home-dept home-dbox"><div className="home-dscroll">
        {roster.map((r) => (
          <div key={r.id} className="home-dec">
            <div className="home-dec-what">Roster submission: {r.department_name || 'Department'}
              <small>{[r.director_name, r.wcm_name ? `names ${r.wcm_name} as WCM` : null].filter(Boolean).join(' ')}{r.submitted_at ? `. Submitted ${new Date(r.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.` : '.'}</small>
            </div>
            <button type="button" className="home-btn" onClick={() => onNavigate('wcm-roster')}>Review and approve</button>
          </div>
        ))}
        <div className="home-dec">
          <div className="home-dec-what">Banner submissions<small>WCM banners waiting for review.</small></div>
          {th.banners.pending ? <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('banner-submissions')}>{th.banners.pending} waiting</button> : <span className="home-hint">None waiting</span>}
        </div>
        <div className="home-dec">
          <div className="home-dec-what">Proud Points<small>School homepage highlights waiting for review.</small></div>
          {th.proud_points?.pending ? <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('proud-points')}>{th.proud_points.pending} waiting</button> : <span className="home-hint">None waiting</span>}
        </div>
        <div className="home-dec">
          <div className="home-dec-what">Access requests<small>Someone asking to help with a report.</small></div>
          {team?.access_requests ? <button type="button" className="wcm-hub2-card-btn" onClick={onOpenOps}>{team.access_requests} waiting</button> : <span className="home-hint">None waiting</span>}
        </div>
      </div></div>
      </section>
      <section className="home-dcol" aria-label="Inbox">
      <h3 className="home-grp">Inbox</h3>
      <InboxSection onOpenOps={onOpenOps} onOpenInbox={onOpenInbox} />
      </section>
      <section className="home-dcol" aria-label="Your tasks">
      <h3 className="home-grp">Your tasks</h3>
      <TopTasks items={th.my_assignments} onNavigate={onNavigate} />
      </section>
      </div>
    </>
  )
}

// The five tasks that matter most: high priority first, then anything past
// its date, soonest first (Sean, 2026-10-01). Each opens that assignment's
// notes; the button below opens the whole page.
function TopTasks({ items, onNavigate }: { items: Assignment[]; onNavigate: Navigate }) {
  const high = items.filter((a) => a.priority === 'high')
  const late = items.filter((a) => a.priority !== 'high' && a.past_date)
  const top = [...high, ...late].slice(0, 5)
  return (
    <div className="home-dept home-dbox">
      <div className="home-dscroll">
        <p className="home-card-text">{high.length ? `${high.length} high priority` : 'No high priority tasks'}{late.length ? `, ${late.length} past their date` : ''}. Your top five:</p>
        {top.length === 0 ? (
          <p className="home-card-text">Nothing high priority or past its date on the Web Team Assignments page.</p>
        ) : (
          <ul className="home-tasks">
            {top.map((a) => (
              <li key={a.slug}>
                <button type="button" className="home-task" onClick={() => openAssignment(a.slug)}>
                  <span className="home-task-title">{a.title}</span>
                  <span className="home-task-meta">
                    {a.priority === 'high' && <span className="home-tag late">High</span>}
                    {a.past_date && a.priority !== 'high' && <span className="home-tag late">Past date</span>}
                    <span>{a.date_label || 'No date'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="home-dfoot">
        <button type="button" className="home-btn" onClick={() => onNavigate('bcps-assignments')}>Open Web Team Assignments</button>
      </div>
    </div>
  )
}

// The site inbox (wcm_pilot_feedback via /api/bcps/messages, the same one
// Team Operations shows). Unanswered messages first; open one to read it and
// reply in place. Voice replies and account access stay in Team Operations.
function InboxSection({ onOpenOps, onOpenInbox }: { onOpenOps: () => void; onOpenInbox: () => void }) {
  const [messages, setMessages] = useState<InboxMessage[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [all, setAll] = useState(false)

  async function load() {
    try {
      const r = await fetch('/api/bcps/messages', { headers: await authHeaders(), cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      setMessages((j.messages ?? []) as InboxMessage[])
    } catch { setFailed(true) }
  }
  useEffect(() => { load() }, [])

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/bcps/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Could not send.')
    return j
  }

  async function open(m: InboxMessage) {
    setNotice(null); setReply('')
    setOpenId(openId === m.id ? null : m.id)
    if (!m.read_at) { try { await post({ id: m.id, action: 'read' }); load() } catch { /* still readable */ } }
  }

  async function send(m: InboxMessage) {
    if (!reply.trim()) return
    setSending(true); setNotice(null)
    try {
      const j = await post({ id: m.id, action: 'reply', reply_text: reply.trim() })
      setNotice(j.warning ? `Saved, but not emailed: ${j.warning}` : 'Reply sent.')
      setReply(''); load()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not send.') }
    finally { setSending(false) }
  }

  const foot = (
    <div className="home-dfoot">
      <button type="button" className="home-btn" onClick={onOpenInbox}>Open the full inbox</button>
    </div>
  )
  if (failed) return <div className="home-dept home-dbox"><div className="home-dscroll"><p className="home-card-text">The inbox could not load right now.</p></div>{foot}</div>
  if (!messages) return <div className="home-dept home-dbox"><div className="home-dscroll"><p className="home-card-text">Loading your inbox...</p></div>{foot}</div>
  const sorted = [...messages].sort((a, b) => Number(!!a.replied_at) - Number(!!b.replied_at) || b.created_at.localeCompare(a.created_at))
  const waiting = sorted.filter((m) => !m.replied_at).length
  const shown = all ? sorted : sorted.slice(0, 6)
  return (
    <div className="home-dept home-dbox"><div className="home-dscroll">
      <p className="home-card-text">{waiting ? `${waiting} waiting for a reply.` : 'Everything has a reply.'} Site feedback, questions and director meeting requests land here.</p>
      {shown.length === 0 && <p className="home-card-text">No messages yet.</p>}
      {shown.map((m) => (
        <div key={m.id} className="home-msg">
          <button type="button" className="home-msg-head" aria-expanded={openId === m.id} onClick={() => open(m)}>
            <span className="home-msg-from">
              {!m.read_at && <span className="home-dot" aria-label="Unread" />}
              {m.email || 'Not identified'}
              <small>{new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{m.page ? ` \u00b7 ${m.page}` : ''}</small>
            </span>
            <span className="home-msg-snip">{m.message.length > 110 && openId !== m.id ? m.message.slice(0, 110) + '\u2026' : (openId === m.id ? '' : m.message)}</span>
            <span className={`home-status ${m.replied_at ? 'done' : 'todo'}`}>{m.replied_at ? 'Replied' : 'Needs reply'}</span>
          </button>
          {openId === m.id && (
            <div className="home-msg-body">
              <p>{m.message}</p>
              {m.admin_reply && <p className="home-msg-reply"><b>Your reply:</b> {m.admin_reply}</p>}
              <label className="sr-only" htmlFor={`reply-${m.id}`}>Reply</label>
              <textarea id={`reply-${m.id}`} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={m.email ? `Reply to ${m.email}` : 'Reply'} />
              <div className="home-actions home-actions-tight">
                <button type="button" className="home-btn" disabled={sending || !reply.trim() || !m.email} onClick={() => send(m)}>{sending ? 'Sending...' : 'Send reply'}</button>
                <button type="button" className="wcm-hub2-card-btn" onClick={onOpenOps}>Voice reply or account access</button>
                {notice && <span className="home-hint">{notice}</span>}
              </div>
            </div>
          )}
        </div>
      ))}
      {sorted.length > 6 && <button type="button" className="home-link-btn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${sorted.length}`}</button>}
    </div>{foot}</div>
  )
}

function TeamPanel({ members }: { members: TeamMemberWork[] }) {
  const groups: [TeamKind, string][] = [['comms', 'Office of Communications: departments'], ['appsvc', 'Application Services: ADA, schools and tools']]
  return (
    <>
      <p className="wcm-hub2-intro">What each person on the District Web Team is carrying, from the Web Team Assignments page. Only you see this tab.</p>
      {groups.map(([kind, label]) => {
        const list = members.filter((m) => m.team === kind)
        if (!list.length) return null
        return (
          <div key={kind}>
            <h3 className="home-grp">{label}</h3>
            <div className="home-dept-grid">
              {list.map((m) => {
                const past = m.assignments.filter((a) => a.past_date).length
                return (
                  <div key={m.email} className="home-dept">
                    <div className="home-person">
                      <div className="avatar" style={{ background: avatarColor(m.user_id) }} aria-hidden="true">{initialsOf(m.name)}</div>
                      <div className="home-person-info">
                        <h3>{m.name}</h3>
                        {m.title && <span>{m.title}</span>}
                        {m.department && <span>{m.department}</span>}
                      </div>
                      <span className="home-chip">{m.assignments.length} open</span>
                    </div>
                    {past > 0 && <div className="home-dept-sub">{past} past their date</div>}
                    <ul className="home-mini">
                      {m.assignments.slice(0, 3).map((a) => <li key={a.slug}><span>{a.title}</span>{a.date_label && <b>{a.date_label}</b>}</li>)}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

function AdminPanel({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const cards: [PageId, string, string][] = [
    ['superadmin', 'Platform Management', 'Accounts, View as access and platform settings.'],
    ['permissions', 'Permissions', 'Who can open which page and document.'],
    ['registrations', 'Registrations', 'New sign-ups waiting on approval.'],
    ['pulse-approvals', 'Note Approvals', 'Notes waiting to publish.'],
    ['reports', 'Reports', 'Program reports and exports.'],
    ['marcomm', 'Newsroom', 'The MarComm console.'],
    ['graphics', 'Graphics & Printing', 'Graphics and print requests.'],
  ]
  return (
    <>
      <p className="wcm-hub2-intro">The consoles only a SuperAdmin can open, in one place.</p>
      <div className="wcm-hub2-grid">
        {cards.map(([page, title, desc]) => (
          <div key={page} className="wcm-hub2-card">
            <h3>{title}</h3>
            <p>{desc}</p>
            <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate(page)}>Open</button>
          </div>
        ))}
      </div>
    </>
  )
}

// The full Departments page (scores, traffic, audit), the same one the
// menu opens, so the tab never shows less than the page (Sean, 2026-10-01).
function DepartmentsPanel({ onNavigate }: { onNavigate: Navigate }) {
  return <DepartmentsPage onNavigate={onNavigate} />
}

function SuperAdminHome({ data, onNavigate, viewAsUserId, preview, onShowToast }: { data: HomeData; onNavigate: Navigate; viewAsUserId?: string; preview?: boolean; onShowToast?: (msg: string) => void }) {
  const [tab, setTab] = useState('overview')
  // The full inbox lives in Team Operations (voice replies, account access).
  const openInbox = () => {
    setTab('ops')
    setTimeout(() => document.getElementById('dashboard-messages-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400)
  }
  const th = data.team_home!
  const p = th.program
  const decisions = (th.decisions?.roster_pending.length ?? 0) + th.banners.pending + (th.proud_points?.pending ?? 0) + (data.team?.messages_unread ?? 0) + (data.team?.access_requests ?? 0)
  const w = currentWindow()
  const wStats = p.windows.find((x) => x.id === w.id)
  const name = firstName(data)
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'marcomm', label: 'MarComm Assignments' },
    { id: 'program', label: 'Program' },
    ...((th.team_members?.length ?? 0) > 0 ? [{ id: 'team', label: 'Team' }] : []),
    { id: 'departments', label: 'Departments' },
    { id: 'audits', label: 'Audits' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'ada', label: 'ADA' },
    { id: 'tools', label: 'Tools & Resources' },
    { id: 'admin', label: 'Admin' },
    { id: 'ops', label: 'Team Operations' },
  ]
  return (
    <div className="home">
      {preview && <PreviewBanner><strong>Previewing the SuperAdmin dashboard.</strong> Numbers and lists are live.</PreviewBanner>}
      <HomeTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'overview' && <>
      <div className="home-hero">
        <div className="home-hero-label">BCPS MarComm SuperAdmin</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        <p>Everything waiting on you, how the whole program is moving, and what each person on the team is carrying. The District Web Team sees the same program numbers; decisions, admin consoles and the team view are yours alone.</p>
        <div className="home-actions">
          <button type="button" className="home-btn" onClick={() => onNavigate('bcps-assignments')}>Open Web Team Assignments</button>
          <button type="button" className="wcm-hub2-card-btn" onClick={() => setTab('marcomm')}>Open MarComm Assignments</button>
          {!preview && <ViewAsButton />}
        </div>
      </div>
      <div className="home-strip">
        <StatTile label="Needs your decision" value={decisions} note={decisions ? 'Listed below' : 'Nothing waiting'} tone={decisions ? 'warn' : undefined} />
        <StatTile label="WCMs certified" value={`${p.wcms_certified} of ${p.wcms_total}`} note={`Rostered department WCMs. Due ${DEPT_CERT_DEADLINE}.`} tone={p.wcms_certified < p.wcms_total ? 'warn' : undefined} />
        <StatTile label="Directors signed in" value={`${p.directors_signed_in} of ${p.directors_on_file}`} note="Directors on file with an account" />
        <StatTile label={`${w.label} ${windowState(w) === 'open' ? 'open' : 'next'}`} value={`${wStats?.departments ?? 0} depts`} note={`${formatWindowRange(w)}. ${wStats?.signed_off ?? 0} signed off.`} />
      </div>
      <DecisionsPanel th={th} team={data.team} onNavigate={onNavigate} onOpenOps={() => setTab('ops')} onOpenInbox={openInbox} />
      </>}
      {tab === 'analytics' && <AnalyticsTabPage onShowToast={onShowToast} />}
      {tab === 'marcomm' && <MarcommAssignmentsPage embedded />}
      {tab === 'program' && <ProgramPanel p={p} />}
      {tab === 'team' && <TeamPanel members={th.team_members ?? []} />}
      {tab === 'departments' && <DepartmentsPanel onNavigate={onNavigate} />}
      {tab === 'ada' && <AdaPanel ada={th.ada} onNavigate={onNavigate} />}
      {tab === 'audits' && <AuditsPanel depts={data.departments} onNavigate={onNavigate} />}
      {tab === 'tools' && <ToolsPanel kind="superadmin" onNavigate={onNavigate} kb={th.kb_articles ?? []} hotLabs={data.hot_labs ?? []} />}
      {tab === 'admin' && <AdminPanel onNavigate={onNavigate} />}
      {tab === 'ops' && <DashboardPage onNavigate={onNavigate} viewAsUserId={viewAsUserId} />}
    </div>
  )
}

function WebTeamHome({ data, kind, onNavigate, assignments, who, previewNote, onShowToast }: {
  data: HomeData
  kind: TeamKind
  onNavigate: Navigate
  assignments: Assignment[]
  who?: string
  previewNote?: string
  onShowToast?: (msg: string) => void
}) {
  const [tab, setTab] = useState('overview')
  const { pages } = useBCPSShell()
  const canAnalytics = !pages || pages.includes('analytics')
  const th = data.team_home!
  const p = th.program
  const w = currentWindow()
  const wStats = p.windows.find((x) => x.id === w.id)
  const lead = assignments.filter((a) => a.role === 'lead').length
  const past = assignments.filter((a) => a.past_date).length
  const greet = who ? who.split(/\s+/)[0] : firstName(data)
  const tabs = kind === 'comms'
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'marcomm', label: 'MarComm Assignments' },
        { id: 'audits', label: 'Audits' },
        { id: 'program', label: 'Program' },
        { id: 'departments', label: 'Departments' },
        ...(canAnalytics ? [{ id: 'analytics', label: 'Analytics' }] : []),
        { id: 'banners', label: 'Banners' },
        { id: 'wcm', label: 'WCM View' },
        { id: 'tools', label: 'Tools & Resources' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'ada', label: 'ADA' },
        { id: 'banners', label: 'Banners' },
        { id: 'program', label: 'Program' },
        ...(canAnalytics ? [{ id: 'analytics', label: 'Analytics' }] : []),
        { id: 'tools', label: 'Tools & Resources' },
      ]
  return (
    <div className="home">
      {previewNote && <PreviewBanner>{previewNote}</PreviewBanner>}
      <HomeTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'overview' && <>
      <div className="home-hero">
        <div className="home-hero-label">BCPS MarComm District Web Team</div>
        <h1 className="home-title">{greet ? `Welcome, ${greet}` : 'Welcome'}</h1>
        <p>{kind === 'comms'
          ? 'Your assignments, the departments in this review window, and how the program is moving.'
          : 'Your assignments, accessibility across our sites, the widgets, and every tool you use.'}</p>
        <div className="home-actions">
          <button type="button" className="home-btn" onClick={() => onNavigate('bcps-assignments')}>Open Web Team Assignments</button>
          {kind === 'comms' && <button type="button" className="wcm-hub2-card-btn" onClick={() => setTab('marcomm')}>Open MarComm Assignments</button>}
          {kind === 'appsvc' && <button type="button" className="wcm-hub2-card-btn" onClick={() => onNavigate('ada-scanner')}>Open ADA Scanner</button>}
        </div>
      </div>
      <div className="home-strip">
        <StatTile label="My open assignments" value={assignments.length} note={`Lead on ${lead}, support on ${assignments.length - lead}.${past ? ` ${past} past their date.` : ''}`} tone={past ? 'warn' : undefined} />
        {kind === 'comms' ? (
          <>
            <StatTile label={`${w.label} ${windowState(w) === 'open' ? 'open' : 'next'}`} value={`${wStats?.departments ?? 0} depts`} note={formatWindowRange(w)} />
            <StatTile label="WCMs certified" value={`${p.wcms_certified} of ${p.wcms_total}`} note={`Due ${DEPT_CERT_DEADLINE}`} />
          </>
        ) : (
          <>
            <StatTile label="Average ADA score" value={th.ada.average_score ?? '-'} note={`${th.ada.sites_scanned} department sites scanned`} />
            <StatTile label="Next Hot Lab" value={nextHotLab()} note="Tuesdays and Thursdays" />
          </>
        )}
        <StatTile label="Banners to review" value={th.banners.pending} note="Banner Submissions" tone={th.banners.pending ? 'warn' : undefined} />
        <StatTile label="Proud Points to review" value={th.proud_points?.pending ?? 0} note={th.proud_points?.ready ? `${th.proud_points.ready} approved, not posted yet` : 'Proud Points'} tone={th.proud_points?.pending ? 'warn' : undefined} />
      </div>
      <MyWorkPanel items={assignments} who={who} onNavigate={onNavigate} />
      </>}
      {tab === 'marcomm' && <MarcommAssignmentsPage embedded />}
      {tab === 'audits' && <AuditsPanel depts={data.departments} onNavigate={onNavigate} />}
      {tab === 'program' && <ProgramPanel p={p} />}
      {tab === 'departments' && <DepartmentsPanel onNavigate={onNavigate} />}
      {tab === 'banners' && <BannersPanel b={th.banners} pp={th.proud_points} onNavigate={onNavigate} />}
      {tab === 'ada' && <AdaPanel ada={th.ada} onNavigate={onNavigate} />}
      {tab === 'analytics' && <AnalyticsTabPage onShowToast={onShowToast} />}
      {tab === 'wcm' && <WcmCommunityHub />}
      {tab === 'tools' && <ToolsPanel kind={kind} onNavigate={onNavigate} kb={th.kb_articles ?? []} hotLabs={data.hot_labs ?? []} />}
    </div>
  )
}

function HomeTabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="wcm-hub2-tabs" role="tablist" aria-label="Dashboard sections" data-scroll-strip>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`wcm-hub2-tab${active === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export default function HomePage({ onNavigate, viewAsUserId, onShowToast }: { onNavigate: Navigate; viewAsUserId?: string; onShowToast?: (msg: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/bcps/home', { headers: await authHeaders(), cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const json = (await res.json()) as HomeData
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const directorSample = useMemo(
    () => (viewAsUserId === SAMPLE_DIRECTOR_ID && (data || failed) ? sampleDirectorData(data) : null),
    [viewAsUserId, data, failed]
  )
  const wcmSample = useMemo(() => (viewAsUserId === SAMPLE_WCM_ID ? sampleWcmData() : null), [viewAsUserId])
  const schoolWcmSample = useMemo(() => (viewAsUserId === SAMPLE_SCHOOL_WCM_ID ? sampleSchoolWcmData() : null), [viewAsUserId])

  // "View as" previews: the Director and WCM samples get their own home with
  // sample data. The web team previews (the two samples, or a real team
  // member chosen on the SuperAdmin's Team tab) and the SuperAdmin sample
  // use the team data the signed-in team member already receives.
  if (viewAsUserId === SAMPLE_DIRECTOR_ID) {
    if (!directorSample) return <div className="wcm-hub2-empty">Loading the preview...</div>
    return <DirectorHome key="preview-director" data={directorSample} preview onNavigate={onNavigate} />
  }
  if (wcmSample) return <WcmHome key="preview-wcm" data={wcmSample} preview onNavigate={onNavigate} />
  if (schoolWcmSample) return <SchoolWcmHome key="preview-school-wcm" data={schoolWcmSample} preview onNavigate={onNavigate} />
  if (viewAsUserId) {
    if (!data && !failed) return <div className="wcm-hub2-empty">Loading the preview...</div>
    const th = data?.team_home
    if (data && th) {
      if (viewAsUserId === SAMPLE_SUPERADMIN_ID && data.experience === 'superadmin') {
        return <SuperAdminHome key="preview-sa" data={data} onNavigate={onNavigate} viewAsUserId={viewAsUserId} preview onShowToast={onShowToast} />
      }
      const kind = viewAsUserId === 'SDA' ? 'appsvc' : viewAsUserId === 'SDW' ? 'comms' : null
      if (kind) {
        return (
          <WebTeamHome
            key={`preview-${viewAsUserId}`}
            data={data}
            kind={kind}
            onNavigate={onNavigate}
            assignments={SAMPLE_TEAM_ASSIGNMENTS}
            who={kind === 'comms' ? 'Dana Okafor' : 'Chris Morgan'}
            onShowToast={onShowToast}
            previewNote={`Previewing the Web Team: ${kind === 'comms' ? 'Communications' : 'Application Services'} dashboard with a sample person. My Work is sample rows; program numbers are live.`}
          />
        )
      }
    }
    return <DashboardPage onNavigate={onNavigate} viewAsUserId={viewAsUserId} />
  }

  if (failed) return <DashboardPage onNavigate={onNavigate} />
  if (!data) return <div className="wcm-hub2-empty">Loading your dashboard...</div>

  if (data.experience === 'superadmin' && data.team_home) return <SuperAdminHome data={data} onNavigate={onNavigate} onShowToast={onShowToast} />
  if (data.experience === 'dwt' && data.team_home) {
    return <WebTeamHome data={data} kind={data.team_kind ?? 'comms'} onNavigate={onNavigate} assignments={data.team_home.my_assignments} onShowToast={onShowToast} />
  }
  if (data.experience === 'director') return <DirectorHome data={data} onNavigate={onNavigate} />
  if (data.experience === 'school_wcm') return <SchoolWcmHome data={data} onNavigate={onNavigate} />
  if (data.experience === 'wcm') return <WcmHome data={data} onNavigate={onNavigate} />
  return <MemberHome data={data} onNavigate={onNavigate} />
}
