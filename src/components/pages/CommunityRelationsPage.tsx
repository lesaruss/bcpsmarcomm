'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'

const ACCESS_KEY = 'lr-dcr-7b2e4a90'

const PROGRAM_AREAS = [
  'SSP',
  'Partners In Education',
  'Caliber Awards',
  'Community Involvement Awards',
  'Customer Service',
  'Financial Administration',
  'Inventory',
] as const

const STATUSES: { id: string; label: string; badge: string }[] = [
  { id: 'todo', label: 'To Do', badge: 'badge-gray' },
  { id: 'in_progress', label: 'In Progress', badge: 'badge-blue' },
  { id: 'blocked', label: 'Needs Support', badge: 'badge-yellow' },
  { id: 'done', label: 'Done', badge: 'badge-green' },
]

const TEAM = [
  { name: 'Keyla Concepción', role: 'Director', kind: 'Observes' },
  { name: 'Dr. Carolyn Stewart', role: 'Coordinator', kind: 'Observes and reviews' },
  { name: 'Noel Hyatt', role: 'Community Relations Specialist', kind: 'Submits and tracks' },
]

interface Task {
  id: string
  program_area: string
  title: string
  detail: string | null
  assignee: string
  status: string
  due_date: string | null
  created_at: string
  updated_at: string
}
interface DailyReport {
  id: string
  report_date: string
  specialist: string
  completed: string | null
  in_progress: string | null
  pending: string | null
  issues: string | null
  next_priorities: string | null
  created_at: string
}
interface WeeklyReport {
  id: string
  week_ending: string
  specialist: string
  accomplishments: string | null
  outstanding: string | null
  deadlines: string | null
  challenges: string | null
  solutions: string | null
  ssp_status: string | null
  awards_status: string | null
  created_at: string
}

type Tab = 'board' | 'submit' | 'reports'

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit', color: 'var(--text-primary)', background: '#fff' }

export default function CommunityRelationsPage() {
  const [tab, setTab] = useState<Tab>('board')
  const [tasks, setTasks] = useState<Task[]>([])
  const [daily, setDaily] = useState<DailyReport[]>([])
  const [weekly, setWeekly] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [toast, setToast] = useState<string | null>(null)

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2600) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/bcps/dcr?key=${ACCESS_KEY}`)
      const j = await r.json()
      if (j.ok) {
        setTasks(j.tasks)
        setDaily(j.daily)
        setWeekly(j.weekly)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/bcps/dcr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ACCESS_KEY, ...payload }),
    })
    return r.ok
  }, [])

  const updateStatus = useCallback(async (id: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    await post({ action: 'task_update', id, status })
  }, [post])

  const visibleTasks = useMemo(
    () => filter === 'all' ? tasks : tasks.filter(t => t.program_area === filter),
    [tasks, filter]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    STATUSES.forEach(s => { byStatus[s.id] = tasks.filter(t => t.status === s.id).length })
    const byArea: Record<string, number> = {}
    PROGRAM_AREAS.forEach(a => { byArea[a] = tasks.filter(t => t.program_area === a).length })
    return { byStatus, byArea, total: tasks.length }
  }, [tasks])

  return (
    <div className="content" style={{ padding: '24px 28px', maxWidth: 1120, margin: '0 auto' }}>

      {/* Intro */}
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--text-primary)' }}>District Community Relations Task Tracker</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 760 }}>
          One shared place for the department&apos;s program work. The Specialist submits and tracks tasks; the Director and Coordinator observe and keep the record. Progress tracking attaches to the role, so it scales as the team grows.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          {TEAM.map(p => (
            <div key={p.name} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{p.role} &middot; {p.kind}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1.5px solid var(--border)' }}>
        {([['board', 'Department Board'], ['submit', 'Submit (Specialist)'], ['reports', 'Reports & Summary']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '10px 14px', fontSize: 13.5, fontWeight: 700,
              color: tab === id ? 'var(--blue)' : 'var(--text-secondary)',
              borderBottom: tab === id ? '2.5px solid var(--blue)' : '2.5px solid transparent',
              marginBottom: -1.5,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading...</p>}

      {/* ── Department Board ── */}
      {!loading && tab === 'board' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Program area</span>
            <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}>
              <option value="all">All areas</option>
              {PROGRAM_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{visibleTasks.length} task(s)</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
            {STATUSES.map(col => {
              const colTasks = visibleTasks.filter(t => t.status === col.id)
              return (
                <div key={col.id} style={{ background: 'var(--bg-page, #f6f8fb)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className={`badge ${col.badge}`}>{col.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{colTasks.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTasks.map(t => (
                      <div key={t.id} className="card" style={{ padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t.title}</div>
                        {t.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 8 }}>{t.detail}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                          <span className="badge badge-blue-light" style={{ fontSize: 10.5 }}>{t.program_area}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.assignee}</span>
                          {t.due_date && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Due {t.due_date}</span>}
                        </div>
                        <select
                          value={t.status}
                          onChange={e => updateStatus(t.id, e.target.value)}
                          style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
                        >
                          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                    ))}
                    {colTasks.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 2px' }}>None</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Submit ── */}
      {!loading && tab === 'submit' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <AddTaskCard onCreate={async (p) => { const ok = await post({ action: 'task_create', ...p }); if (ok) { flash('Task added'); load() } }} />
          <DailyReportCard onSubmit={async (p) => { const ok = await post({ action: 'daily_submit', ...p }); if (ok) { flash('Daily report submitted'); load() } }} />
          <WeeklyReportCard onSubmit={async (p) => { const ok = await post({ action: 'weekly_submit', ...p }); if (ok) { flash('Weekly report submitted'); load() } }} />
        </div>
      )}

      {/* ── Reports & Summary ── */}
      {!loading && tab === 'reports' && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>Status summary</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {STATUSES.map(s => (
                <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{counts.byStatus[s.id]}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{s.label}</div>
                </div>
              ))}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', minWidth: 120, background: 'var(--blue-xlight, #eef4fb)' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{counts.total}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Total tasks</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PROGRAM_AREAS.map(a => (
                <span key={a} className="badge badge-gray" style={{ fontSize: 11.5 }}>{a}: {counts.byArea[a]}</span>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text-primary)' }}>Daily activity reports</h3>
              {daily.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None submitted yet.</p>}
              {daily.map(d => (
                <div key={d.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>{d.report_date} &middot; {d.specialist}</div>
                  <ReportLine label="Completed" value={d.completed} />
                  <ReportLine label="In progress" value={d.in_progress} />
                  <ReportLine label="Pending" value={d.pending} />
                  <ReportLine label="Issues" value={d.issues} />
                  <ReportLine label="Next-day priorities" value={d.next_priorities} />
                </div>
              ))}
            </div>
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text-primary)' }}>Weekly performance reports</h3>
              {weekly.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None submitted yet.</p>}
              {weekly.map(w => (
                <div key={w.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue)', marginBottom: 6 }}>Week ending {w.week_ending} &middot; {w.specialist}</div>
                  <ReportLine label="Accomplishments" value={w.accomplishments} />
                  <ReportLine label="Outstanding" value={w.outstanding} />
                  <ReportLine label="Upcoming deadlines" value={w.deadlines} />
                  <ReportLine label="Challenges" value={w.challenges} />
                  <ReportLine label="Recommended solutions" value={w.solutions} />
                  <ReportLine label="SSP status" value={w.ssp_status} />
                  <ReportLine label="Caliber / CIA status" value={w.awards_status} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast toast-show">{toast}</div>}
    </div>
  )
}

function ReportLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}: </span>
      <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function AddTaskCard({ onCreate }: { onCreate: (p: Record<string, unknown>) => void }) {
  const [program_area, setArea] = useState<string>(PROGRAM_AREAS[0])
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [assignee, setAssignee] = useState('Noel Hyatt')
  const [due_date, setDue] = useState('')
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>Add a task</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Log program work onto the board.</p>
      <label style={labelStyle}>Program area</label>
      <select value={program_area} onChange={e => setArea(e.target.value)} style={inputStyle}>
        {PROGRAM_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <label style={labelStyle}>Task</label>
      <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing" />
      <label style={labelStyle}>Detail</label>
      <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={detail} onChange={e => setDetail(e.target.value)} />
      <label style={labelStyle}>Assignee</label>
      <input style={inputStyle} value={assignee} onChange={e => setAssignee(e.target.value)} />
      <label style={labelStyle}>Due date</label>
      <input type="date" style={inputStyle} value={due_date} onChange={e => setDue(e.target.value)} />
      <button
        className="btn btn-primary"
        style={{ marginTop: 14, width: '100%' }}
        disabled={!title.trim()}
        onClick={() => { onCreate({ program_area, title, detail, assignee, due_date }); setTitle(''); setDetail(''); setDue('') }}
      >
        Add task
      </button>
    </div>
  )
}

function DailyReportCard({ onSubmit }: { onSubmit: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ completed: '', in_progress: '', pending: '', issues: '', next_priorities: '' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>Daily activity report</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Submit before end of day.</p>
      <label style={labelStyle}>Tasks completed</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.completed} onChange={set('completed')} />
      <label style={labelStyle}>In progress</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.in_progress} onChange={set('in_progress')} />
      <label style={labelStyle}>Pending</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.pending} onChange={set('pending')} />
      <label style={labelStyle}>Issues requiring assistance</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.issues} onChange={set('issues')} />
      <label style={labelStyle}>Priorities for next day</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.next_priorities} onChange={set('next_priorities')} />
      <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => { onSubmit(f); setF({ completed: '', in_progress: '', pending: '', issues: '', next_priorities: '' }) }}>
        Submit daily report
      </button>
    </div>
  )
}

function WeeklyReportCard({ onSubmit }: { onSubmit: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ accomplishments: '', outstanding: '', deadlines: '', challenges: '', solutions: '', ssp_status: '', awards_status: '' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLTextAreaElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>Weekly performance report</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Submit by 3 p.m. Friday.</p>
      <label style={labelStyle}>Accomplishments</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.accomplishments} onChange={set('accomplishments')} />
      <label style={labelStyle}>Outstanding assignments</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.outstanding} onChange={set('outstanding')} />
      <label style={labelStyle}>Upcoming deadlines</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.deadlines} onChange={set('deadlines')} />
      <label style={labelStyle}>Challenges</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.challenges} onChange={set('challenges')} />
      <label style={labelStyle}>Recommended solutions</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.solutions} onChange={set('solutions')} />
      <label style={labelStyle}>SSP status</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.ssp_status} onChange={set('ssp_status')} />
      <label style={labelStyle}>Caliber / CIA status</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.awards_status} onChange={set('awards_status')} />
      <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => { onSubmit(f); setF({ accomplishments: '', outstanding: '', deadlines: '', challenges: '', solutions: '', ssp_status: '', awards_status: '' }) }}>
        Submit weekly report
      </button>
    </div>
  )
}
