'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { PageId } from '@/lib/types'
import { MEMBERS } from '@/lib/data'

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

export default function DashboardPage({ onNavigate, viewAsUserId }: DashboardPageProps) {
  const [notes, setNotes] = useState<AssignmentNote[]>([])
  const [notesLoading, setNotesLoading] = useState(true)
  const [certProgress, setCertProgress] = useState<{ pct: number; completed: number; total: number; allDone: boolean } | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [openNote, setOpenNote] = useState<AssignmentNote | null>(null)
  const [teamMembers, setTeamMembers] = useState<Array<{ user_id: string; name: string; initials: string; color: string; role: string; department: { slug: string; name: string; division: string | null } | null }>>([])
  const [meId, setMeId] = useState<string | null>(null)
  const router = useRouter()

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
        .select('completed')
        .eq('user_id', user.id)
        .eq('course_id', 'dept-wcm-v1')
        .then(({ data }) => {
          if (!data) return
          const completed = data.filter((r: { completed: boolean }) => r.completed).length
          const total = 89 // total pages in dept-wcm-v1
          const pct = Math.round((completed / total) * 100)
          setCertProgress({ pct, completed, total, allDone: completed >= total })
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

  return (
    <div className="dashboard">
      {/* Welcome Banner */}
      <div className="welcome-banner">
        <div className="welcome-text">
          <h2>Good morning, {viewAsUserId ? MEMBERS.find(m => m.initials === viewAsUserId)?.name.split(' ')[0] ?? 'Team' : (userName ?? 'there')}</h2>
          <p>Here&apos;s what&apos;s happening across Broward County Public Schools today.</p>
        </div>
        <button className="btn btn-primary" onClick={() => onNavigate('notes')}>
          + New Meeting Note
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-value">{card.value}</div>
            <div className="stat-label">{card.label}</div>
            <div className={`stat-delta ${card.positive ? 'positive' : 'neutral'}`}>{card.delta}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {/* Recent Assignment Notes - live from Supabase */}
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

        {/* WCM Certification */}
        {certProgress !== null && (
          <div className="dash-panel">
            <div className="dash-panel-header">
              <h3>WCM Certification</h3>
              <a href="/bcps/certification/departments" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
                {certProgress.allDone ? 'View certificate →' : 'Continue →'}
              </a>
            </div>
            <div style={{ padding: '4px 0 8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: certProgress.allDone ? '#16750C' : 'var(--primary)', lineHeight: 1 }}>{certProgress.pct}%</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 3 }}>
                    {certProgress.allDone ? 'Certification complete' : `${certProgress.completed} of ${certProgress.total} pages completed`}
                  </div>
                </div>
                {certProgress.allDone && (
                  <div style={{ fontSize: '20px', lineHeight: 1 }}>+</div>
                )}
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: certProgress.pct + '%', background: certProgress.allDone ? '#16750C' : 'var(--primary)', borderRadius: 8, transition: 'width 0.4s ease' }} />
              </div>
              {!certProgress.allDone && certProgress.completed === 0 && (
                <a href="/bcps/certification/departments/welcome" style={{ display: 'inline-block', marginTop: 12, padding: '8px 16px', background: 'var(--primary)', color: '#fff', borderRadius: 6, fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>
                  Begin Certification
                </a>
              )}
            </div>
          </div>
        )}

        {/* Team Members - live from the directory */}
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
                    <button onClick={() => router.push(`/bcps?page=members&member=${m.user_id}`, { scroll: false })}
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

        {/* My Department */}
        {(() => {
          const myDept = teamMembers.find(m => m.user_id === meId)?.department
          return (
            <div className="dash-panel">
              <div className="dash-panel-header">
                <h3>My Department</h3>
                {myDept && <button className="link-btn" onClick={() => router.push(`/bcps?page=departments&dept=${myDept.slug}`, { scroll: false })}>Open profile &rarr;</button>}
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
          )
        })()}

        {/* Quick Actions */}
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

        {/* Consoles */}
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
    </div>
  )
}
