'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

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

type ProgramArea = typeof PROGRAM_AREAS[number]

const STATUSES: { id: string; label: string; badge: string }[] = [
  { id: 'todo',        label: 'To Do',         badge: 'badge-gray'   },
  { id: 'in_progress', label: 'In Progress',   badge: 'badge-blue'   },
  { id: 'blocked',     label: 'Needs Support', badge: 'badge-yellow' },
  { id: 'done',        label: 'Done',          badge: 'badge-green'  },
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

interface WeeklyFormData {
  week_ending: string
  accomplishments: string
  outstanding: string
  deadlines: string
  challenges: string
  solutions: string
  ssp_status: string
  awards_status: string
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

type Tab = 'board' | 'mywork' | 'reports'

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit',
  color: 'var(--text-primary)', background: '#fff',
}

// Build a plain-English weekly summary draft from live task data.
function buildWeeklySummaryDraft(tasks: Task[]): Omit<WeeklyFormData, 'week_ending'> {
  const done        = tasks.filter(t => t.status === 'done')
  const inProgress  = tasks.filter(t => t.status === 'in_progress')
  const blocked     = tasks.filter(t => t.status === 'blocked')

  const fmt = (list: Task[]) =>
    list.map(t => `${t.title} (${t.program_area})`).join('; ') || ''

  const areaStatusLines = (PROGRAM_AREAS as readonly string[]).map(area => {
    const areaTotal = tasks.filter(t => t.program_area === area).length
    if (areaTotal === 0) return null
    const areaDone  = tasks.filter(t => t.program_area === area && t.status === 'done').length
    return `${area}: ${areaDone}/${areaTotal} complete`
  }).filter(Boolean).join(' | ')

  return {
    accomplishments: fmt(done),
    outstanding:     fmt(inProgress),
    deadlines:       '',
    challenges:      blocked.length > 0
      ? fmt(blocked) + ' - flagged as Needs Support'
      : '',
    solutions:       '',
    ssp_status:      tasks.filter(t => t.program_area === 'SSP').length > 0
      ? areaStatusLines.split(' | ').find(l => l.startsWith('SSP')) ?? ''
      : '',
    awards_status:   [
      areaStatusLines.split(' | ').find(l => l.startsWith('Caliber')),
      areaStatusLines.split(' | ').find(l => l.startsWith('Community')),
    ].filter(Boolean).join(' | '),
  }
}

export default function CommunityRelationsPage() {
  const [tab,     setTab]     = useState<Tab>('board')
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [weekly,  setWeekly]  = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState<string>('all')
  const [toast,   setToast]   = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // ── Drag state ──────────────────────────────────────────────────────────
  const [draggingId,  setDraggingId]  = useState<string | null>(null)
  const [dragOverId,  setDragOverId]  = useState<string | null>(null)
  const [dragAbove,   setDragAbove]   = useState(true)
  // ────────────────────────────────────────────────────────────────────────

  const searchParams = useSearchParams()
  const readOnly = searchParams.get('view') === 'board'

  const flash = useCallback((m: string) => {
    setToast(m)
    setTimeout(() => setToast(null), 2800)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/bcps/dcr?key=${ACCESS_KEY}`)
      const j = await r.json()
      if (j.ok) {
        setTasks(j.tasks)
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
    if (status === 'blocked') flash('Needs Support flagged - Dr. Stewart has been notified.')
  }, [post, flash])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    await post({ action: 'task_delete', id })
    flash('Task removed.')
  }, [post, flash])

  // ── Drag reorder ─────────────────────────────────────────────────────────
  const handleReorder = useCallback((
    newStatus: string,
    targetId: string | null,
    above = true,
  ) => {
    if (!draggingId) return
    const currentId = draggingId

    setTasks(prev => {
      const draggedTask = prev.find(t => t.id === currentId)
      if (!draggedTask || currentId === targetId) return prev

      const without = prev.filter(t => t.id !== currentId)
      const updated  = { ...draggedTask, status: newStatus }

      if (!targetId) return [...without, updated]

      const targetIdx = without.findIndex(t => t.id === targetId)
      if (targetIdx === -1) return [...without, updated]

      const result = [...without]
      result.splice(above ? targetIdx : targetIdx + 1, 0, updated)
      return result
    })

    // Persist only if status actually changed
    const draggedTask = tasks.find(t => t.id === currentId)
    if (draggedTask && draggedTask.status !== newStatus) {
      post({ action: 'task_update', id: currentId, status: newStatus })
      if (newStatus === 'blocked') flash('Needs Support flagged - Dr. Stewart has been notified.')
    }

    setDraggingId(null)
    setDragOverId(null)
  }, [draggingId, tasks, post, flash])
  // ────────────────────────────────────────────────────────────────────────

  const visibleTasks = useMemo(
    () => filter === 'all' ? tasks : tasks.filter(t => t.program_area === filter),
    [tasks, filter]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    STATUSES.forEach(s => { byStatus[s.id] = tasks.filter(t => t.status === s.id).length })
    return { byStatus, total: tasks.length }
  }, [tasks])

  const isSeeded = tasks.length > 0 && tasks.every(t => {
    const d = new Date(t.created_at)
    const ref = new Date('2026-07-01')
    return d < ref
  })

  return (
    <div className="content" style={{ padding: '24px 28px' }}>

      {/* Header */}
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--text-primary)' }}>
          District Community Relations
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 720 }}>
          Your board for managing program work across all seven department areas.
          Add tasks, move them as work progresses, and flag anything that needs attention.
          The Director and Coordinator see the board in real time.
        </p>
      </div>

      {/* Starter kit banner - hide in read-only view */}
      {!readOnly && !bannerDismissed && isSeeded && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, fontSize: 13, color: '#78350f', lineHeight: 1.55 }}>
            <strong>Starter tasks loaded.</strong> These seven tasks are suggested starting points
            based on the department&apos;s program areas. Edit the titles, add detail, change due dates,
            or delete anything that does not fit - make the board yours.
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, color: '#92400e', lineHeight: 1, padding: 2,
            }}
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1.5px solid var(--border)' }}>
        {([
          ['board',   'Department Board'],
          ...(!readOnly ? [['mywork',  'My Work'], ['reports', 'Reports']] as [Tab, string][] : []),
        ] as [Tab, string][]).map(([id, label]) => (
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
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', padding: '7px 10px' }}
            >
              <option value="all">All areas</option>
              {PROGRAM_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {visibleTasks.length} task(s)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
            {STATUSES.map(col => {
              const colTasks = visibleTasks.filter(t => t.status === col.id)
              const isBlocked = col.id === 'blocked'
              return (
                <div
                  key={col.id}
                  style={{
                    background: isBlocked ? '#fffbeb' : 'var(--bg-page, #f6f8fb)',
                    border: `1px solid ${isBlocked ? '#fcd34d' : 'var(--border)'}`,
                    borderRadius: 10, padding: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className={`badge ${col.badge}`}>{col.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{colTasks.length}</span>
                  </div>

                  {/* ── Cards container — drop target for empty-column drops ── */}
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      // Only fires when dropping on the column itself (not on a card,
                      // since card drops call stopPropagation). Appends to end.
                      handleReorder(col.id, null, false)
                    }}
                  >
                    {colTasks.map(t => (
                      <div
                        key={t.id}
                        draggable={!readOnly}
                        onDragStart={e => {
                          e.stopPropagation()
                          setDraggingId(t.id)
                        }}
                        onDragEnd={() => {
                          setDraggingId(null)
                          setDragOverId(null)
                        }}
                        onDragOver={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          const above = e.clientY < rect.top + rect.height / 2
                          if (dragOverId !== t.id || dragAbove !== above) {
                            setDragOverId(t.id)
                            setDragAbove(above)
                          }
                        }}
                        onDrop={e => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleReorder(col.id, t.id, dragAbove)
                        }}
                        style={{
                          opacity: draggingId === t.id ? 0.4 : 1,
                          cursor: readOnly ? 'default' : 'grab',
                        }}
                      >
                        {/* Insertion indicator — above */}
                        {dragOverId === t.id && dragAbove && draggingId !== t.id && (
                          <div style={{
                            height: 3, background: '#1a56db', borderRadius: 2,
                            marginBottom: 6, pointerEvents: 'none',
                          }} />
                        )}

                        <TaskCard
                          task={t}
                          readOnly={readOnly}
                          onStatusChange={updateStatus}
                          onEdit={async (updated) => {
                            const ok = await post({ action: 'task_update', ...updated })
                            if (ok) {
                              setTasks(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
                            }
                          }}
                          onDelete={deleteTask}
                        />

                        {/* Insertion indicator — below */}
                        {dragOverId === t.id && !dragAbove && draggingId !== t.id && (
                          <div style={{
                            height: 3, background: '#1a56db', borderRadius: 2,
                            marginTop: 6, pointerEvents: 'none',
                          }} />
                        )}
                      </div>
                    ))}

                    {colTasks.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 2px' }}>None</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── My Work ── */}
      {!loading && tab === 'mywork' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
          <AddTaskCard
            onCreate={async (p) => {
              const ok = await post({ action: 'task_create', ...p })
              if (ok) { flash('Task added.'); load() }
            }}
          />
          <WeeklyDraftCard
            tasks={tasks}
            onSubmit={async (p) => {
              const ok = await post({ action: 'weekly_submit', ...p })
              if (ok) { flash('Weekly summary submitted.'); load() }
            }}
          />
        </div>
      )}

      {/* ── Reports ── */}
      {!loading && tab === 'reports' && (
        <>
          {/* Status summary */}
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
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Total</div>
              </div>
            </div>
          </div>

          {/* Done tasks */}
          {tasks.filter(t => t.status === 'done').length > 0 && (
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>Completed</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tasks.filter(t => t.status === 'done').map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#16a34a', fontSize: 14 }}>&#10003;</span>
                    <span style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>{t.title}</span>
                    <span className="badge badge-gray" style={{ fontSize: 10.5, marginLeft: 'auto' }}>{t.program_area}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly summaries */}
          <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--text-primary)' }}>Weekly summaries</h3>
          {weekly.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>None submitted yet.</p>
          )}
          {weekly.map(w => (
            <div key={w.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--blue)', marginBottom: 8 }}>
                Week ending {w.week_ending} &middot; {w.specialist}
              </div>
              <ReportLine label="Accomplishments"        value={w.accomplishments}  />
              <ReportLine label="Outstanding"            value={w.outstanding}      />
              <ReportLine label="Upcoming deadlines"     value={w.deadlines}        />
              <ReportLine label="Challenges"             value={w.challenges}       />
              <ReportLine label="Recommended solutions"  value={w.solutions}        />
              <ReportLine label="SSP status"             value={w.ssp_status}       />
              <ReportLine label="Caliber / CIA status"   value={w.awards_status}    />
            </div>
          ))}
        </>
      )}

      {toast && <div className="toast toast-show">{toast}</div>}
    </div>
  )
}

// ── Task card with inline edit ──────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  readOnly?: boolean
  onStatusChange: (id: string, status: string) => void
  onEdit: (updated: Partial<Task> & { id: string }) => void
  onDelete: (id: string) => void
}

function TaskCard({ task, readOnly, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const [editing, setEditing]     = useState(false)
  const [title,   setTitle]       = useState(task.title)
  const [detail,  setDetail]      = useState(task.detail ?? '')
  const [area,    setArea]        = useState<ProgramArea>(task.program_area as ProgramArea)
  const [due,     setDue]         = useState(task.due_date ?? '')
  const [status,  setStatus]      = useState(task.status)
  const [saving,  setSaving]      = useState(false)
  const [confirming, setConfirming] = useState(false)

  const saveEdit = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onEdit({ id: task.id, title: title.trim(), detail: detail || null, program_area: area, due_date: due || null, status })
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card" style={{ padding: 12, border: '1.5px solid var(--blue)' }}>
        <label style={labelStyle}>Task</label>
        <input
          style={inputStyle}
          value={title}
          onChange={e => setTitle(e.target.value)}
          autoFocus
        />
        <label style={labelStyle}>Detail</label>
        <textarea
          style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }}
          value={detail}
          onChange={e => setDetail(e.target.value)}
        />
        <label style={labelStyle}>Program area</label>
        <select value={area} onChange={e => setArea(e.target.value as ProgramArea)} style={inputStyle}>
          {PROGRAM_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <label style={labelStyle}>Due date</label>
        <input type="date" style={inputStyle} value={due} onChange={e => setDue(e.target.value)} />
        <label style={labelStyle}>Status</label>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1, fontSize: 12.5 }} onClick={saveEdit} disabled={saving || !title.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            className="btn"
            style={{ fontSize: 12.5, background: 'none', border: '1px solid var(--border)' }}
            onClick={() => {
              setTitle(task.title); setDetail(task.detail ?? '')
              setArea(task.program_area as ProgramArea); setDue(task.due_date ?? '')
              setStatus(task.status)
              setEditing(false)
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{task.title}</div>
        {!readOnly && (
          <button
            onClick={() => setEditing(true)}
            title="Edit task"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
            aria-label="Edit task"
          >
            &#9998;
          </button>
        )}
        {!readOnly && confirming ? (
          <>
            <button
              onClick={() => onDelete(task.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#dc2626', padding: '0 2px', fontWeight: 700 }}
            >
              Delete?
            </button>
            <button
              onClick={() => setConfirming(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)', padding: '0 2px' }}
            >
              No
            </button>
          </>
        ) : (
          !readOnly && (
            <button
              onClick={() => setConfirming(true)}
              title="Remove task"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }}
              aria-label="Remove task"
            >
              &times;
            </button>
          )
        )}
      </div>
      {task.detail && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 8 }}>{task.detail}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <span className="badge badge-blue-light" style={{ fontSize: 10.5 }}>{task.program_area}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{task.assignee}</span>
        {task.due_date && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Due {task.due_date}</span>}
      </div>
      <span className={`badge ${STATUSES.find(s => s.id === task.status)?.badge ?? 'badge-gray'}`} style={{ fontSize: 11 }}>
        {STATUSES.find(s => s.id === task.status)?.label ?? task.status}
      </span>
    </div>
  )
}

// ── Add task card ───────────────────────────────────────────────────────────

function AddTaskCard({ onCreate }: { onCreate: (p: Record<string, unknown>) => void }) {
  const [program_area, setArea]     = useState<string>(PROGRAM_AREAS[0])
  const [title,        setTitle]    = useState('')
  const [detail,       setDetail]   = useState('')
  const [due_date,     setDue]      = useState('')

  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>Add a task</h3>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
        Add work to the board. It will appear in your To Do column.
      </p>
      <label style={labelStyle}>Program area</label>
      <select value={program_area} onChange={e => setArea(e.target.value)} style={inputStyle}>
        {PROGRAM_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <label style={labelStyle}>Task</label>
      <input
        style={inputStyle}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="What needs doing"
      />
      <label style={labelStyle}>Detail (optional)</label>
      <textarea
        style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
        value={detail}
        onChange={e => setDetail(e.target.value)}
      />
      <label style={labelStyle}>Due date (optional)</label>
      <input type="date" style={inputStyle} value={due_date} onChange={e => setDue(e.target.value)} />
      <button
        className="btn btn-primary"
        style={{ marginTop: 14, width: '100%' }}
        disabled={!title.trim()}
        onClick={() => {
          onCreate({ program_area, title, detail, assignee: 'Noel Hyatt', due_date })
          setTitle(''); setDetail(''); setDue('')
        }}
      >
        Add task
      </button>
    </div>
  )
}

// ── Weekly draft card ───────────────────────────────────────────────────────

function WeeklyDraftCard({ tasks, onSubmit }: { tasks: Task[]; onSubmit: (p: Record<string, unknown>) => void }) {
  const draft = useMemo(() => buildWeeklySummaryDraft(tasks), [tasks])

  const [f, setF] = useState<WeeklyFormData>({ ...draft, week_ending: '' })

  // Refresh draft when tasks change
  useEffect(() => {
    setF(prev => ({
      ...draft,
      week_ending: prev.week_ending,
      // Keep any manual edits the user made to fields with content
      challenges:  prev.challenges  || draft.challenges,
      solutions:   prev.solutions   || draft.solutions,
      deadlines:   prev.deadlines   || draft.deadlines,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length])

  const set = (k: string) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--text-primary)' }}>Weekly summary</h3>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-secondary)' }}>
        Pre-filled from your board. Edit anything before sending.
      </p>
      <label style={labelStyle}>Week ending</label>
      <input type="date" style={inputStyle} value={f.week_ending} onChange={set('week_ending')} />
      <label style={labelStyle}>Accomplishments</label>
      <textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={f.accomplishments} onChange={set('accomplishments')} />
      <label style={labelStyle}>Still in progress</label>
      <textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={f.outstanding} onChange={set('outstanding')} />
      <label style={labelStyle}>Upcoming deadlines</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.deadlines} onChange={set('deadlines')} />
      <label style={labelStyle}>Challenges</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.challenges} onChange={set('challenges')} />
      <label style={labelStyle}>Solutions / requests</label>
      <textarea style={{ ...inputStyle, minHeight: 48, resize: 'vertical' }} value={f.solutions} onChange={set('solutions')} />
      <label style={labelStyle}>SSP status</label>
      <textarea style={{ ...inputStyle, minHeight: 40, resize: 'vertical' }} value={f.ssp_status} onChange={set('ssp_status')} />
      <label style={labelStyle}>Caliber / CIA status</label>
      <textarea style={{ ...inputStyle, minHeight: 40, resize: 'vertical' }} value={f.awards_status} onChange={set('awards_status')} />
      <button
        className="btn btn-primary"
        style={{ marginTop: 14, width: '100%' }}
        disabled={!f.week_ending}
        onClick={() => {
          onSubmit({ specialist: 'Noel Hyatt', ...f })
          setF({ ...buildWeeklySummaryDraft(tasks), week_ending: '' })
        }}
      >
        Submit weekly summary
      </button>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function ReportLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}: </span>
      <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
