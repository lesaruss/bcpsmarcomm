'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import type { PageId, BreadcrumbItem } from '@/lib/types'

const ACCESS_KEY = 'lr-ooc-web-9d2e7f14'

const CATEGORIES = [
  'Communications',
  'Web Content',
  'Governance',
  'Analytics',
  'Tickets',
  'Meetings',
  'General',
] as const
type Category = typeof CATEGORIES[number]

const STATUSES: { id: string; label: string; badge: string; color: string }[] = [
  { id: 'todo',        label: 'To Do',         badge: 'badge-gray',   color: '#6B7280' },
  { id: 'in_progress', label: 'In Progress',   badge: 'badge-blue',   color: '#1672A7' },
  { id: 'blocked',     label: 'Needs Support', badge: 'badge-yellow', color: '#D97706' },
]

const MEMBERS = [
  { id: 'all',  label: 'All Members' },
  { id: 'sr',   label: 'Sean A. Russell' },
  { id: 'fh',   label: 'Felicia Hicks' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: '#DC2626',
  med:  '#D97706',
  low:  '#6B7280',
}
const PRIORITY_LABELS: Record<string, string> = {
  high: 'High',
  med:  'Med',
  low:  'Low',
}

const ASSIGNEE_COLORS: Record<string, string> = {
  sr:   '#1672A7',
  fh:   '#682D87',
  both: '#16750C',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px',
  border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit',
  color: 'var(--text-primary)', background: '#fff',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12,
}

interface Task {
  id: string
  category: string
  title: string
  detail: string | null
  assignee: string
  status: string
  due_date: string | null
  priority: string
  created_at: string
  updated_at: string
}

/* ─── Add Task Form ───────────────────────────────────────────────────────── */
function AddTaskCard({ onCreate }: {
  onCreate: (p: Partial<Task>) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [title,    setTitle]    = useState('')
  const [detail,   setDetail]   = useState('')
  const [category, setCategory] = useState<Category>('General')
  const [assignee, setAssignee] = useState<'sr' | 'fh' | 'both'>('sr')
  const [priority, setPriority] = useState<'high' | 'med' | 'low'>('med')
  const [due,      setDue]      = useState('')
  const [saving,   setSaving]   = useState(false)

  const reset = () => {
    setTitle(''); setDetail(''); setCategory('General')
    setAssignee('sr'); setPriority('med'); setDue('')
    setOpen(false)
  }

  const submit = async () => {
    if (!title.trim()) return
    setSaving(true)
    await onCreate({ title: title.trim(), detail: detail.trim() || undefined, category, assignee, priority, due_date: due || undefined, status: 'todo' })
    setSaving(false)
    reset()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          background: 'none', border: '1.5px dashed var(--border)',
          borderRadius: 9, padding: '10px 14px', cursor: 'pointer',
          fontSize: 13.5, color: 'var(--text-secondary)', width: '100%',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add task
      </button>
    )
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 10, border: '1.5px solid var(--blue)' }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: 'var(--text-primary)' }}>New Task</div>

      <label style={labelStyle}>Title *</label>
      <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Task title" autoFocus />

      <label style={labelStyle}>Detail</label>
      <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }}
        value={detail} onChange={e => setDetail(e.target.value)} placeholder="Optional details" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Category</label>
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value as Category)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Assign to</label>
          <select style={inputStyle} value={assignee} onChange={e => setAssignee(e.target.value as 'sr' | 'fh' | 'both')}>
            <option value="sr">Sean A. Russell</option>
            <option value="fh">Felicia Hicks</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Priority</label>
          <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value as 'high' | 'med' | 'low')}>
            <option value="high">High</option>
            <option value="med">Med</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Due date</label>
          <input type="date" style={inputStyle} value={due} onChange={e => setDue(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={submit}
          disabled={saving || !title.trim()}
          style={{
            padding: '8px 18px', background: 'var(--blue)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Add task'}
        </button>
        <button
          onClick={reset}
          style={{
            padding: '8px 14px', background: 'none',
            border: '1.5px solid var(--border)', borderRadius: 8,
            fontSize: 13.5, cursor: 'pointer', color: 'var(--text-secondary)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ─── Task Card ───────────────────────────────────────────────────────────── */
function TaskCard({ task, onStatusChange, onEdit, onDelete }: {
  task: Task
  onStatusChange: (id: string, status: string) => void
  onEdit: (updated: Partial<Task> & { id: string }) => Promise<void>
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing,  setEditing]  = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDetail, setEditDetail] = useState(task.detail ?? '')
  const [editDue, setEditDue] = useState(task.due_date ?? '')
  const [editAssignee, setEditAssignee] = useState(task.assignee)
  const [editPriority, setEditPriority] = useState(task.priority)
  const [editCategory, setEditCategory] = useState(task.category)
  const [saving, setSaving] = useState(false)

  const isOverdue = task.due_date && new Date(task.due_date) < new Date()

  const saveEdit = async () => {
    if (!editTitle.trim()) return
    setSaving(true)
    await onEdit({
      id: task.id,
      title: editTitle.trim(),
      detail: editDetail.trim() || null,
      due_date: editDue || null,
      assignee: editAssignee,
      priority: editPriority,
      category: editCategory,
    })
    setSaving(false)
    setEditing(false)
  }

  const nextStatuses = STATUSES.filter(s => s.id !== task.status)

  if (editing) {
    return (
      <div className="card" style={{ padding: 14, fontSize: 13 }}>
        <label style={labelStyle}>Title</label>
        <input style={inputStyle} value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus />
        <label style={labelStyle}>Detail</label>
        <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }}
          value={editDetail} onChange={e => setEditDetail(e.target.value)} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select style={inputStyle} value={editCategory} onChange={e => setEditCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assign to</label>
            <select style={inputStyle} value={editAssignee} onChange={e => setEditAssignee(e.target.value)}>
              <option value="sr">Sean</option>
              <option value="fh">Felicia</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Priority</label>
            <select style={inputStyle} value={editPriority} onChange={e => setEditPriority(e.target.value)}>
              <option value="high">High</option>
              <option value="med">Med</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Due date</label>
            <input type="date" style={inputStyle} value={editDue} onChange={e => setEditDue(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={saveEdit} disabled={saving}
            style={{ padding: '7px 14px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)}
            style={{ padding: '7px 12px', background: 'none', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{ padding: '11px 13px', fontSize: 13, cursor: 'pointer', transition: 'box-shadow 0.15s' }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: 13.5, color: 'var(--text-primary)',
            lineHeight: 1.4, wordBreak: 'break-word',
          }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
            {/* Category */}
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 7px',
              borderRadius: 20, background: '#EEF2FF', color: '#4338CA',
            }}>
              {task.category}
            </span>
            {/* Assignee */}
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '2px 7px',
              borderRadius: 20,
              background: ASSIGNEE_COLORS[task.assignee] + '18',
              color: ASSIGNEE_COLORS[task.assignee],
            }}>
              {task.assignee === 'both' ? 'SR + FH' : task.assignee.toUpperCase()}
            </span>
            {/* Priority if high */}
            {task.priority === 'high' && (
              <span style={{
                fontSize: 10.5, fontWeight: 700, padding: '2px 7px',
                borderRadius: 20, background: '#FEF2F2', color: '#DC2626',
              }}>
                High
              </span>
            )}
            {/* Due date */}
            {task.due_date && (
              <span style={{
                fontSize: 10.5, color: isOverdue ? '#DC2626' : 'var(--text-muted)',
                fontWeight: isOverdue ? 700 : 400,
              }}>
                {isOverdue ? 'Overdue ' : 'Due '}{task.due_date}
              </span>
            )}
          </div>
        </div>

        {/* Edit / Delete buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            title="Edit"
            onClick={() => { setEditing(true); setExpanded(false) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
          >
            ✎
          </button>
          <button
            title="Remove"
            onClick={() => onDelete(task.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '2px 4px' }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Expanded: detail + move actions */}
      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }} onClick={e => e.stopPropagation()}>
          {task.detail && (
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {task.detail}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {nextStatuses.map(s => (
              <button
                key={s.id}
                onClick={() => { onStatusChange(task.id, s.id); setExpanded(false) }}
                style={{
                  padding: '5px 12px', border: `1.5px solid ${s.color}`,
                  borderRadius: 7, cursor: 'pointer', fontSize: 12,
                  fontWeight: 700, background: 'none', color: s.color,
                }}
              >
                Move to {s.label}
              </button>
            ))}
            <button
              onClick={() => { onStatusChange(task.id, 'done'); setExpanded(false) }}
              style={{
                padding: '5px 12px', border: '1.5px solid #16a34a',
                borderRadius: 7, cursor: 'pointer', fontSize: 12,
                fontWeight: 700, background: 'none', color: '#16a34a',
              }}
            >
              Mark Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */
interface QueuePageProps {
  onNavigate?: (page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => void
  onShowToast?: (msg: string) => void
  viewAsUserId?: string
}

export default function QueuePage({ onShowToast }: QueuePageProps) {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [member,  setMember]  = useState<'all' | 'sr' | 'fh'>('all')
  const [toast,   setToast]   = useState<string | null>(null)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragAbove,  setDragAbove]  = useState(true)

  const flash = useCallback((m: string) => {
    setToast(m)
    onShowToast?.(m)
    setTimeout(() => setToast(null), 2800)
  }, [onShowToast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/bcps/ooc-queue?key=${ACCESS_KEY}`)
      const j = await r.json()
      if (j.ok) setTasks(j.tasks)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/bcps/ooc-queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: ACCESS_KEY, ...payload }),
    })
    return r.ok
  }, [])

  const updateStatus = useCallback(async (id: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    await post({ action: 'task_update', id, status })
    if (status === 'blocked') flash('Needs Support flagged.')
    if (status === 'done') {
      // remove from board after a brief delay
      setTimeout(() => setTasks(prev => prev.filter(t => t.id !== id)), 400)
    }
  }, [post, flash])

  const deleteTask = useCallback(async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    await post({ action: 'task_delete', id })
    flash('Task removed.')
  }, [post, flash])

  const handleReorder = useCallback((newStatus: string, targetId: string | null, above = true) => {
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

    const draggedTask = tasks.find(t => t.id === currentId)
    if (draggedTask && draggedTask.status !== newStatus) {
      post({ action: 'task_update', id: currentId, status: newStatus })
      if (newStatus === 'blocked') flash('Needs Support flagged.')
    }

    setDraggingId(null)
    setDragOverId(null)
  }, [draggingId, tasks, post, flash])

  const visibleTasks = useMemo(() => {
    if (member === 'all') return tasks
    return tasks.filter(t => t.assignee === member || t.assignee === 'both')
  }, [tasks, member])

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    STATUSES.forEach(s => { byStatus[s.id] = visibleTasks.filter(t => t.status === s.id).length })
    return { byStatus, total: visibleTasks.length }
  }, [visibleTasks])

  return (
    <div className="content" style={{ padding: '24px 28px' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#1A1A2E', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13.5, zIndex: 9999, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="card" style={{ padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 5px', fontSize: 18, color: 'var(--text-primary)' }}>
              OOC Web Members Queue
            </h2>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              Active tasks for Sean A. Russell and Felicia Hicks. Drag to reorder, click a card to move or mark done.
            </p>
          </div>
          {/* Member pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {MEMBERS.map(m => (
              <button
                key={m.id}
                onClick={() => setMember(m.id as typeof member)}
                style={{
                  padding: '7px 14px', borderRadius: 20, fontSize: 12.5, fontWeight: 700,
                  cursor: 'pointer', border: '1.5px solid',
                  borderColor: member === m.id ? 'var(--blue)' : 'var(--border)',
                  background: member === m.id ? 'var(--blue)' : 'transparent',
                  color: member === m.id ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary counts */}
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {STATUSES.map(s => (
            <div key={s.id} style={{
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 14px', minWidth: 90, background: 'var(--bg-page, #f6f8fb)',
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{counts.byStatus[s.id]}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</div>
            </div>
          ))}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '8px 14px', minWidth: 90, background: '#EEF2FF',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#4338CA' }}>{counts.total}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Active</div>
          </div>
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Loading queue...</p>
      )}

      {!loading && (
        <>
          {/* Add Task */}
          <AddTaskCard
            onCreate={async (p) => {
              const ok = await post({ action: 'task_create', ...p })
              if (ok) { flash('Task added.'); load() }
            }}
          />

          {/* Kanban Board */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, alignItems: 'start', marginTop: 6 }}>
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
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleReorder(col.id, null, false) }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className={`badge ${col.badge}`}>{col.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{colTasks.length}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {colTasks.map(t => (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={e => { e.stopPropagation(); setDraggingId(t.id) }}
                        onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                        onDragOver={e => {
                          e.preventDefault(); e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          const above = e.clientY < rect.top + rect.height / 2
                          if (dragOverId !== t.id || dragAbove !== above) {
                            setDragOverId(t.id); setDragAbove(above)
                          }
                        }}
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); handleReorder(col.id, t.id, dragAbove) }}
                        style={{ opacity: draggingId === t.id ? 0.4 : 1, cursor: 'grab' }}
                      >
                        {dragOverId === t.id && dragAbove && draggingId !== t.id && (
                          <div style={{ height: 3, background: '#1a56db', borderRadius: 2, marginBottom: 6, pointerEvents: 'none' }} />
                        )}
                        <TaskCard
                          task={t}
                          onStatusChange={updateStatus}
                          onEdit={async (updated) => {
                            const ok = await post({ action: 'task_update', ...updated })
                            if (ok) setTasks(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
                          }}
                          onDelete={deleteTask}
                        />
                        {dragOverId === t.id && !dragAbove && draggingId !== t.id && (
                          <div style={{ height: 3, background: '#1a56db', borderRadius: 2, marginTop: 6, pointerEvents: 'none' }} />
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
    </div>
  )
}
