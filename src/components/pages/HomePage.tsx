'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { PageId } from '@/lib/types'
import DashboardPage from './DashboardPage'
import { WcmCommunityHub } from './WCMPage'

// The BCPS Marcom dashboard (Sean, 2026-10-01; playbook wcm-community-hub,
// "BCPS Marcom Dashboard"). One home page that sets itself up for whoever
// signs in: the District Web Team, a director, or a WCM. /api/bcps/home
// decides the experience server-side and returns only that person's data.
// Every version has the same two layers: a status strip ("what needs my
// attention") and tabs of cards ("where do I go"). No placeholders: a card
// only appears when its link works for the person seeing it.
//
// The previous dashboard is kept whole as the District Web Team's Team
// Operations tab, so none of its tiles are lost while they move to their new
// homes. "View as" previews keep showing that dashboard unchanged.

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Director confirmation form (bcps_wcm_roster_submissions), the same link the
// roster page and director emails use.
const ROSTER_SIGNUP_URL = '/wcm-roster-signup'
// Department certification deadline (Sept 30 applies to schools only).
const DEPT_CERT_DEADLINE = 'October 30, 2026'

interface WcmStatus {
  name: string
  email: string | null
  sub_department: string | null
  has_account: boolean
  certified: boolean
  certified_at: string | null
  progress_pct: number
}

interface DepartmentSummary {
  id: string
  name: string
  audit_status: string | null
  wcms: WcmStatus[]
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

function DepartmentCard({ dept }: { dept: DepartmentSummary }) {
  const certified = dept.wcms.filter((w) => w.certified).length
  return (
    <div className="home-dept">
      <div className="home-dept-head">
        <h3>{dept.name}</h3>
        {dept.audit_status && (
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

function StatTile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="home-stat">
      <div className="home-stat-label">{label}</div>
      <div className="home-stat-value">{value}</div>
      {note && <div className="home-stat-note">{note}</div>}
    </div>
  )
}

function openFeedback() {
  window.dispatchEvent(new Event('bcps:open-feedback'))
}

/* ─── DIRECTOR ─────────────────────────────────────────── */
function DirectorHome({ data }: { data: HomeData }) {
  const [tab, setTab] = useState<'department' | 'guide' | 'wcm'>('department')
  const led = data.departments.filter((d) => data.led_department_ids.includes(d.id))
  const totalWcms = led.reduce((n, d) => n + d.wcms.length, 0)
  const certified = led.reduce((n, d) => n + d.wcms.filter((w) => w.certified).length, 0)
  const unconfirmed = led.filter((d) => d.wcms.length === 0).length
  const name = firstName(data)

  return (
    <div className="home">
      <div className="home-hero">
        <div className="wcm-eyebrow">BCPS Marcom &middot; Director</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
        <p>Your department&apos;s website team at a glance: who your Web Content Managers are, where they are with certification, and where your department&apos;s website audit stands.</p>
      </div>
      <div className="home-strip">
        <StatTile label="Web Content Managers" value={totalWcms} note={unconfirmed ? `${unconfirmed} department${unconfirmed > 1 ? 's' : ''} still need one` : 'Confirmed on the roster'} />
        <StatTile label="Certified" value={totalWcms ? `${certified} of ${totalWcms}` : 'None yet'} note={`Deadline ${DEPT_CERT_DEADLINE}`} />
        <StatTile label={led.length > 1 ? 'Departments' : 'Department'} value={led.length} />
      </div>
      <HomeTabs
        tabs={[
          { id: 'department', label: led.length > 1 ? 'My Departments' : 'My Department' },
          { id: 'guide', label: 'Guide' },
          // A director who is also their department's WCM keeps the WCM cards.
          ...(data.is_wcm ? [{ id: 'wcm', label: 'My WCM Work' }] : []),
        ]}
        active={tab}
        onChange={(t) => setTab(t as 'department' | 'guide' | 'wcm')}
      />
      {tab === 'wcm' && <WcmCommunityHub />}
      {tab === 'department' && (
        <div className="home-dept-grid">
          {led.map((d) => <DepartmentCard key={d.id} dept={d} />)}
        </div>
      )}
      {tab === 'guide' && (
        <div className="wcm-hub2-grid">
          <div className="wcm-hub2-card">
            <h3>What Directors Need to Know</h3>
            <p>How the Web Content Manager program works, what your WCM does, and what is expected of your department this year.</p>
            <a className="wcm-hub2-card-btn" href="/playbooks/director-department">Open the guide</a>
          </div>
          <div className="wcm-hub2-card">
            <h3>Confirm or Change Your WCM</h3>
            <p>Name the Web Content Manager for your department, or let the District Web Team know about a change.</p>
            <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Open the form</a>
          </div>
          <div className="wcm-hub2-card">
            <h3>Ask the District Web Team</h3>
            <p>A question about your department&apos;s website, your WCM, or anything on this page? Send it straight to the team.</p>
            <button type="button" className="wcm-hub2-card-btn" onClick={openFeedback}>Send a message</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── WCM ──────────────────────────────────────────────── */
function WcmHome({ data }: { data: HomeData }) {
  const mine = data.departments
  return (
    <div className="home">
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
      <WcmCommunityHub />
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
        <div className="wcm-eyebrow">BCPS Marcom</div>
        <h1 className="home-title">{name ? `Welcome, ${name}` : 'Welcome to BCPS Marcom'}</h1>
        <p>Your account is not connected to a department yet. Once it is, this page shows your department&apos;s website team, certification and audit status.</p>
      </div>
      <div className="wcm-hub2-grid">
        <div className="wcm-hub2-card">
          <h3>Are You a Director?</h3>
          <p>Confirm your department&apos;s Web Content Manager. If this page still does not show your department afterward, let the District Web Team know which department you lead.</p>
          <a className="wcm-hub2-card-btn" href={ROSTER_SIGNUP_URL}>Confirm your WCM</a>
        </div>
        <div className="wcm-hub2-card">
          <h3>What Directors Need to Know</h3>
          <p>How the Web Content Manager program works and what is expected of each department.</p>
          <a className="wcm-hub2-card-btn" href="/playbooks/director-department">Open the guide</a>
        </div>
        <div className="wcm-hub2-card">
          <h3>Ask the District Web Team</h3>
          <p>Not sure why you are seeing this page? Send a message and the team will connect your account.</p>
          <button type="button" className="wcm-hub2-card-btn" onClick={openFeedback}>Send a message</button>
        </div>
      </div>
    </div>
  )
}

/* ─── DISTRICT WEB TEAM ───────────────────────────────── */
function TeamHome({ data, onNavigate }: { data: HomeData; onNavigate: (page: PageId) => void }) {
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
      {tab === 'ops' && <DashboardPage onNavigate={onNavigate} />}
      {tab === 'departments' && (
        <>
          <p className="wcm-hub2-intro">What each director sees for their own department. {withWcm.length} of {depts.length} departments with a website have a confirmed WCM.</p>
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
    if (viewAsUserId) return
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
  }, [viewAsUserId])

  // "View as" previews other people's dashboards; keep it on the existing
  // dashboard, which already handles preview identities.
  if (viewAsUserId) return <DashboardPage onNavigate={onNavigate} viewAsUserId={viewAsUserId} />
  if (failed) return <DashboardPage onNavigate={onNavigate} />
  if (!data) return <div className="wcm-hub2-empty">Loading your dashboard...</div>

  if (data.experience === 'dwt') return <TeamHome data={data} onNavigate={onNavigate} />
  if (data.experience === 'director') return <DirectorHome data={data} />
  if (data.experience === 'wcm') return <WcmHome data={data} />
  return <MemberHome data={data} />
}
