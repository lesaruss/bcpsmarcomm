'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { PageId } from '@/lib/types'
import DashboardPage from './DashboardPage'
import { WcmCommunityHub, type CertStatus } from './WCMPage'
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
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Director confirmation form (bcps_wcm_roster_submissions), the same link the
// roster page and director emails use.
const ROSTER_SIGNUP_URL = '/wcm-roster-signup'
const DIRECTOR_PLAYBOOK_URL = '/playbooks/director-department'
// Department certification deadline (Sept 30 applies to schools only).
const DEPT_CERT_DEADLINE = 'October 30, 2026'
// Director videos (Sean, 2026-10-01). For now each one is a still image with
// Sean's narration (his Higgsfield voice) until he records a scroll-through
// of the dashboard to replace it. Files live in the public bcps-public
// bucket, dashboard-media/. Set a video to null to hide its card.
interface NarratedMedia {
  title: string
  sub: string
  still: string
  audio: string
  transcript: string[]
}
const MEDIA_BASE = 'https://fwbhwfxpncrsfhttimna.supabase.co/storage/v1'
const mediaStill = (name: string) => `${MEDIA_BASE}/render/image/public/bcps-public/dashboard-media/${name}?width=960&quality=80`
const mediaFile = (name: string) => `${MEDIA_BASE}/object/public/bcps-public/dashboard-media/${name}`

const WALKTHROUGH_VIDEO: NarratedMedia | null = {
  title: 'Start here: What BCPS MarComm is, and why we built it',
  sub: 'Two minutes from Sean A. Russell, District Webmaster.',
  still: mediaStill('director-walkthrough-still.png'),
  audio: mediaFile('director-walkthrough-narration.wav'),
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
  audio: mediaFile('director-review-narration.wav'),
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
  findings_open: number
  findings_fixed: number
  wcms: WcmStatus[]
  analytics?: DepartmentAnalytics | null
}

interface WidgetItem { slug: string; title: string; description: string | null; preview_path: string | null }

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
  experience: 'dwt' | 'director' | 'wcm' | 'member'
  is_dwt: boolean
  is_director: boolean
  is_wcm: boolean
  name: string | null
  email: string
  led_department_ids: string[]
  departments: DepartmentSummary[]
  team: { roster_pending: number; messages_unread: number; access_requests: number; certifications_7d: number } | null
  widgets?: WidgetItem[]
  director_notes?: DirectorNote[]
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
    departments: [{ id: 'sample-a', name: 'Sample Purchasing Services', division: 'Finance', website_url: null, audit_status: 'wcm_notified', findings_open: 3, findings_fixed: 2, wcms: [] }],
    team: null,
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

function StatTile({ label, value, note, tone }: { label: string; value: string | number; note?: string; tone?: 'warn' }) {
  return (
    <div className={`home-stat${tone ? ` ${tone}` : ''}`}>
      <div className="home-stat-label">{label}</div>
      <div className="home-stat-value">{value}</div>
      {note && <div className="home-stat-note">{note}</div>}
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

function PreviewBanner({ who }: { who: string }) {
  return (
    <div className="home-preview">
      <strong>Previewing the {who} dashboard</strong> with sample departments and people. Every link and button is the real one.
    </div>
  )
}

/* ─── DIRECTOR ─────────────────────────────────────────── */
type DirectorTab = 'team' | 'review' | 'analytics' | 'notes' | 'widgets' | 'help' | 'wcm'

// The review window that matters most to this director: the open one, else
// the next upcoming one, else the last one (their departments may span
// divisions).
function primaryWindow(depts: DepartmentSummary[]): ReviewWindow | null {
  const ws = Array.from(new Set(depts.map((d) => windowForDivision(d.division)).filter((w): w is ReviewWindow => !!w)))
    .sort((a, b) => a.start.localeCompare(b.start))
  return ws.find((w) => windowState(w) === 'open') ?? ws.find((w) => windowState(w) === 'upcoming') ?? ws[ws.length - 1] ?? null
}

function DirectorHome({ data, preview }: { data: HomeData; preview?: boolean }) {
  const [tab, setTab] = useState<DirectorTab>('team')
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
    { id: 'team', label: 'My Team' },
    { id: 'review', label: 'Website Review' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'notes', label: 'Meeting Notes' },
    ...((data.widgets?.length ?? 0) > 0 ? [{ id: 'widgets' as DirectorTab, label: 'Widgets' }] : []),
    { id: 'help', label: 'Ask & Guide' },
    // A director who is also their department's WCM keeps the WCM cards.
    ...(data.is_wcm ? [{ id: 'wcm' as DirectorTab, label: 'My WCM Work' }] : []),
  ]

  return (
    <div className="home">
      {preview && <PreviewBanner who="director" />}
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

      <HomeTabs tabs={tabs} active={tab} onChange={(t) => setTab(t as DirectorTab)} />

      {tab === 'team' && (
        <>
          <p className="wcm-hub2-intro">Your Web Content Managers and where each one stands with the Department WCM Certification.</p>
          <div className="home-dept-grid">
            {led.map((d) => <DepartmentCard key={d.id} dept={d} showAudit={false} />)}
          </div>
          <div className="home-actions">
            <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Change or add a WCM</a>
          </div>
        </>
      )}
      {tab === 'review' && <ReviewTab led={led} myWindow={myWindow} />}
      {tab === 'analytics' && <AnalyticsTab led={led} />}
      {tab === 'notes' && <NotesTab notes={data.director_notes ?? []} led={led} />}
      {tab === 'widgets' && <WidgetsTab widgets={data.widgets ?? []} />}
      {tab === 'help' && <DirectorHelp myWindow={myWindow} led={led} />}
      {tab === 'wcm' && <WcmCommunityHub />}
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
function WcmHome({ data, preview }: { data: HomeData; preview?: boolean }) {
  const mine = data.departments
  return (
    <div className="home">
      {preview && <PreviewBanner who="WCM" />}
      {mine.length > 0 && (
        <div className="home-strip">
          {mine.map((d) => (
            <StatTile
              key={d.id}
              label={d.name}
              value="Confirmed"
              note={d.audit_status ? `Audit: ${AUDIT_LABELS[d.audit_status] || d.audit_status}` : 'Confirmed by your director'}
            />
          ))}
        </div>
      )}
      {mine.length === 0 && data.is_wcm && (
        <div className="home-notice">
          Your director has not confirmed you on the WCM roster yet. Send them the{' '}
          <a href={ROSTER_SIGNUP_URL}>confirmation form</a> so you are listed for your department.
        </div>
      )}
      <WcmCommunityHub previewCert={preview ? SAMPLE_WCM_CERT : undefined} />
    </div>
  )
}

/* ─── SIGNED IN, NO ROLE YET ──────────────────────────── */
// Not on the District Web Team, not matched as a director, not a WCM. Most
// often a director whose department has no director email on file yet, or a
// WCM whose director has not confirmed them. Only cards they can open.
function MemberHome({ data }: { data: HomeData }) {
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
    </div>
  )
}

/* ─── DISTRICT WEB TEAM ───────────────────────────────── */
function TeamHome({ data, onNavigate, viewAsUserId }: { data: HomeData; onNavigate: (page: PageId) => void; viewAsUserId?: string }) {
  const [tab, setTab] = useState<'ops' | 'departments' | 'wcm'>('ops')
  const t = data.team
  const depts = data.departments
  const withWcm = depts.filter((d) => d.wcms.length > 0)
  const allWcms = depts.flatMap((d) => d.wcms)
  const certified = allWcms.filter((w) => w.certified).length

  return (
    <div className="home">
      <div className="home-strip">
        <StatTile label="Roster submissions to review" value={t?.roster_pending ?? 0} />
        <StatTile label="Unread messages" value={t?.messages_unread ?? 0} />
        <StatTile label="Access requests" value={t?.access_requests ?? 0} />
        <StatTile label="Certified this week" value={t?.certifications_7d ?? 0} note={`${certified} of ${allWcms.length} rostered WCMs certified`} />
      </div>
      <HomeTabs
        tabs={[{ id: 'ops', label: 'Team Operations' }, { id: 'departments', label: 'Departments' }, { id: 'wcm', label: 'WCM View' }]}
        active={tab}
        onChange={(x) => setTab(x as 'ops' | 'departments' | 'wcm')}
      />
      {tab === 'ops' && <DashboardPage onNavigate={onNavigate} viewAsUserId={viewAsUserId} />}
      {tab === 'departments' && (
        <>
          <p className="wcm-hub2-intro">Every department&apos;s WCMs and audit status. {withWcm.length} of {depts.length} departments with a website have a confirmed WCM. To see the director dashboard itself, use View as, Director (Sample).</p>
          <div className="home-dept-grid">
            {depts.map((d) => <DepartmentCard key={d.id} dept={d} />)}
          </div>
        </>
      )}
      {tab === 'wcm' && <WcmCommunityHub />}
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

export default function HomePage({ onNavigate, viewAsUserId }: { onNavigate: (page: PageId) => void; viewAsUserId?: string }) {
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

  // "View as" previews: the Director and WCM samples get their own home with
  // sample data; the District Web Team and Superadmin samples get the team
  // home, whose Team Operations tab keeps the sample handling it had.
  if (viewAsUserId === SAMPLE_DIRECTOR_ID) {
    if (!directorSample) return <div className="wcm-hub2-empty">Loading the preview...</div>
    return <DirectorHome key="preview-director" data={directorSample} preview />
  }
  if (wcmSample) return <WcmHome key="preview-wcm" data={wcmSample} preview />
  if (viewAsUserId) {
    if (data?.experience === 'dwt') return <TeamHome key={`preview-${viewAsUserId}`} data={data} onNavigate={onNavigate} viewAsUserId={viewAsUserId} />
    if (!data && !failed) return <div className="wcm-hub2-empty">Loading the preview...</div>
    return <DashboardPage onNavigate={onNavigate} viewAsUserId={viewAsUserId} />
  }

  if (failed) return <DashboardPage onNavigate={onNavigate} />
  if (!data) return <div className="wcm-hub2-empty">Loading your dashboard...</div>

  if (data.experience === 'dwt') return <TeamHome data={data} onNavigate={onNavigate} />
  if (data.experience === 'director') return <DirectorHome data={data} />
  if (data.experience === 'wcm') return <WcmHome data={data} />
  return <MemberHome data={data} />
}
