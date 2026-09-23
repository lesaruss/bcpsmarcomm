'use client'
import { createClient } from '@/lib/supabase'

// Session token for the API calls below. These routes verify the caller
// server-side as of 2026-09-15 (they previously had no auth at all).
const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

import { useState, useEffect } from 'react'
import type { UserRole } from '@/components/Sidebar'

interface PulseWidgetProps {
  role: UserRole
  // 2026-09-23: lets a ticker link to a playbook open in the shell's doc
  // preview (BCPSShell setDocPreview), the same way the sidebar's inlineDoc
  // playbook links do, instead of hard-navigating out of the app.
  onOpenDoc?: (doc: { title: string; url: string }) => void
}

interface PulseStats {
  totalDepts: number
  healthy: number
  pendingAudits: number
  recentBriefs: number
}

// Ticker messages - Sean 2026-09-04: turn the Pulse bar into more than a
// stat strip by rotating district announcements through it, like a news
// ticker. Hardcoded for this first pass (see message to Sean about wiring
// this to a real announcements table so DWT/MarComm can edit these without
// a code push). linkHref is null where a real destination doesn't exist
// yet - those spans render as plain text, not a link, so nothing points
// to a dead page.
// docTitle marks a linkHref that is a document route (/playbooks/...): it
// opens in the in-shell preview when the shell provides onOpenDoc.
interface TickerMessage { text: string; linkText: string | null; linkHref: string | null; docTitle?: string }

const TICKER_MESSAGES: TickerMessage[] = [
  {
    text: 'Reminder: Department WCM certification course must be completed by October 30.',
    linkText: null,
    linkHref: '?page=bcps-certification',
  },
  {
    text: 'District Web Team kickoff is September 10.',
    linkText: 'Register today',
    linkHref: null, // TODO(Sean): no registration page/form exists yet
  },
  // Per Sean, Hot Lab 2026-09-22: "I even have it in the top level up
  // here, which I'm noticing is not clickable... make sure that that's
  // clickable." It was plain text because linkHref was null (no rollout
  // Playbook existed). Now points at the published Department WCM
  // Playbook, the same URL the sidebar and WCM_PLAYBOOK_URL use. The old
  // copy promised a "rollout timeline", which that playbook does not
  // contain, so the line now names the playbook itself.
  {
    text: 'The Department WCM Playbook is live.',
    linkText: 'View the Playbook',
    linkHref: '/playbooks/wcm-department',
    docTitle: 'Department WCM Playbook',
  },
]

// Sean 2026-09-04 (revised from the first pass): the whole bar rotates now,
// not just a ticker alongside fixed stats. Slide 0 is the stats line, every
// slide after it is one ticker message. Each slide holds for 10s with a
// crossfade. Only the "BCPS Pulse" label + dot stay put on the left.
const SLIDE_HOLD_MS = 10000
const SLIDE_FADE_MS = 300

export default function PulseWidget({ role, onOpenDoc }: PulseWidgetProps) {
  const [stats, setStats] = useState<PulseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [slideVisible, setSlideVisible] = useState(true)

  useEffect(() => {
    if (role !== 'superadmin') return
    setLoading(true)
    authHeaders()
      .then(headers => fetch('/api/pulse', { headers }))
      .then(r => r.json())
      .then((data: PulseStats) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [role])

  // Slide 0 = stats, slides 1..n = ticker messages.
  const slideCount = 1 + TICKER_MESSAGES.length

  // Rotate through slides every 10s with a quick crossfade.
  useEffect(() => {
    if (role !== 'superadmin' || collapsed || loading || slideCount < 2) return
    const interval = setInterval(() => {
      setSlideVisible(false)
      setTimeout(() => {
        setSlideIndex(i => (i + 1) % slideCount)
        setSlideVisible(true)
      }, SLIDE_FADE_MS)
    }, SLIDE_HOLD_MS)
    return () => clearInterval(interval)
  }, [role, collapsed, loading, slideCount])

  if (role !== 'superadmin') return null

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          background: '#1672A7', color: 'white', height: '30px',
          display: 'flex', alignItems: 'center', paddingLeft: '20px',
          gap: '7px', cursor: 'pointer',
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', userSelect: 'none',
        }}
      >
        <span style={{
          display: 'inline-block', width: '6px', height: '6px',
          borderRadius: '50%', background: '#4ade80',
          boxShadow: '0 0 6px #4ade80',
          flexShrink: 0,
        }} />
        BCPS Pulse
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{ marginLeft: 'auto', marginRight: '16px' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    )
  }

  // ── Expanded bar ──────────────────────────────────────────────────────────
  const TILES = stats
    ? [
        { label: 'Departments',   val: stats.totalDepts,    color: 'rgba(255,255,255,0.9)' },
        { label: 'Healthy',       val: stats.healthy,       color: '#4ade80' },
        { label: 'Pending Audits', val: stats.pendingAudits, color: '#fbbf24' },
        { label: 'Briefs (30d)',  val: stats.recentBriefs,  color: '#a5f3fc' },
      ]
    : []

  // Real <a href> either way (so open-in-new-tab still works); a plain
  // click on a doc link opens the in-shell preview when available.
  const docClick = (m: TickerMessage) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!m.docTitle || !m.linkHref || !onOpenDoc) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onOpenDoc({ title: m.docTitle, url: m.linkHref })
  }

  const renderMessage = (m: TickerMessage) => {
    // No separate link phrase - the whole message links (or doesn't) as one unit.
    if (!m.linkText) {
      return m.linkHref ? <a href={m.linkHref} onClick={docClick(m)} style={{ color: 'white', textDecoration: 'none' }}>{m.text}</a> : m.text
    }
    // Separate link phrase appended after the message text.
    return (
      <>
        {m.text}{' '}
        {m.linkHref ? (
          <a href={m.linkHref} onClick={docClick(m)} style={{ color: '#a5f3fc', textDecoration: 'underline', fontWeight: 800 }}>{m.linkText}</a>
        ) : (
          <span style={{ color: '#a5f3fc', fontWeight: 800 }}>{m.linkText}</span>
        )}
      </>
    )
  }

  return (
    <div style={{
      background: '#1672A7',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      padding: '7px 20px',
      display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
    }}>
      {/* Label - stays fixed while the rest of the bar rotates */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#4ade80',
          boxShadow: '0 0 6px #4ade80',
        }} />
        <span style={{
          fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.65)',
          textTransform: 'uppercase', letterSpacing: '0.15em',
        }}>
          BCPS Pulse
        </span>
      </div>

      {/* Rotating slide: stats line, then each ticker message, 10s apiece */}
      {loading ? (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Loading...</span>
      ) : (
        <div style={{
          flex: 1, minWidth: 160, overflow: 'hidden',
          display: 'flex', alignItems: 'center',
          opacity: slideVisible ? 1 : 0, transition: `opacity ${SLIDE_FADE_MS}ms ease`,
        }}>
          {slideIndex === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
              {TILES.map(tile => (
                <div key={tile.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: tile.color, lineHeight: 1 }}>
                    {tile.val}
                  </span>
                  <span style={{
                    fontSize: '10px', color: 'rgba(255,255,255,0.5)',
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    {tile.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{
              fontSize: '11px', fontWeight: 700, color: 'white',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {renderMessage(TICKER_MESSAGES[slideIndex - 1])}
            </span>
          )}
        </div>
      )}

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        title="Collapse Pulse"
        style={{
          background: 'none', border: 'none',
          cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
          padding: '2px', display: 'flex', alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    </div>
  )
}
