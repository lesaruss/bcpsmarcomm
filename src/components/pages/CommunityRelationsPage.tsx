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

// ── DCR Knowledge Base Resources ─────────────────────────────────────────────
interface Resource {
  slug: string
  title: string
  description: string
  type: string
  tags: string[]
  url: string
}

const DCR_RESOURCES: Resource[] = [
  {
    slug: 'nh-ssp-work-plan',
    title: 'NH SSP Work Plan',
    description: 'North Highlands SSP operational work plan outlining program goals, milestones, and responsible parties.',
    type: 'PDF',
    tags: ['SSP'],
    url: '/briefs/nh-ssp-work-plan',
  },
  {
    slug: 'nh-operational-accountability-plan',
    title: 'NH Operational Accountability Plan',
    description: 'North Highlands school accountability plan with performance targets and action steps.',
    type: 'PDF',
    tags: ['SSP'],
    url: '/briefs/nh-operational-accountability-plan',
  },
  {
    slug: 'caliber-awards-timeline-2027',
    title: '2027 Caliber Awards Timeline',
    description: 'Full submission and review calendar for the 2027 Caliber Awards cycle.',
    type: 'PDF',
    tags: ['Caliber Awards'],
    url: '/briefs/caliber-awards-timeline-2027',
  },
  {
    slug: 'caliber-awards-work-plan',
    title: 'Caliber Awards Work Plan',
    description: 'Step-by-step coordination plan for Caliber Awards nominations, judging, and ceremony.',
    type: 'PDF',
    tags: ['Caliber Awards'],
    url: '/briefs/caliber-awards-work-plan',
  },
  {
    slug: 'ssp-review-process',
    title: 'SSP Review Process',
    description: 'Standardized review checklist and process document for SSP site visits.',
    type: 'PDF',
    tags: ['SSP'],
    url: '/briefs/ssp-review-process',
  },
  {
    slug: 'pie-program-guide',
    title: 'Partners In Education Program Guide',
    description: 'Overview of the PIE partnership program, partnership categories, and onboarding steps.',
    type: 'PDF',
    tags: ['Partners In Education'],
    url: '/briefs/pie-program-guide',
  },
  {
    slug: 'cia-submission-guide',
    title: 'Community Involvement Awards Submission Guide',
    description: 'Application requirements, eligibility criteria, and submission instructions for CIA nominees.',
    type: 'PDF',
    tags: ['Community Involvement Awards'],
    url: '/briefs/cia-submission-guide',
  },
  {
    slug: 'dcr-customer-service-standards',
    title: 'DCR Customer Service Standards',
    description: 'Approved service standards and communication protocols for internal and external stakeholders.',
    type: 'PDF',
    tags: ['Customer Service'],
    url: '/briefs/dcr-customer-service-standards',
  },
]
// ─────────────────────────────────────────────────────────────────────────────

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

interface ProjectNote {
  program_area: string
  notes: string | null
  pinned_slugs: string[]
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

type Tab = 'board' | 'mywork' | 'projects' | 'reports'

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700,
  color: 'var(--text-secondary)', marginBottom: 5, marginTop: 12,
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit',
  color: 'var(--text-primary)', background: '#fff',
}

function buildWeeklySummaryDraft(tasks: Task[]): Omit<WeeklyFormData, 'week_ending'> {
  const done       = tasks.filter(t => t.status === 'done')
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const blocked    = tasks.filter(t => t.status === 'blocked')

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
  const [tab,          setTab]          = useState<Tab>('board')
  const [tasks,        setTasks]        = useState<Task[]>([])
  const [weekly,       setWeekly]       = useState<WeeklyReport[]>([])
  const [projectNotes, setProjectNotes] = useState<ProjectNote[]>([])
  const [loading,      setLoading]      = useState(true)
  const [filter,       setFilter]       = useState<string>('all')
  const [toast, setToast] = useState<string | null>(null)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragAbove,  setDragAbove]  = useState(true)

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
        setProjectNotes(j.projectNotes ?? [])
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

    const draggedTask = tasks.find(t => t.id === currentId)
    if (draggedTask && draggedTask.status !== newStatus) {
      post({ action: 'task_update', id: currentId, status: newStatus })
      if (newStatus === 'blocked') flash('Needs Support flagged - Dr. Stewart has been notified.')
    }

    setDraggingId(null)
    setDragOverId(null)
  }, [draggingId, tasks, post, flash])

  const saveProjectNote = useCallback(async (
    program_area: string,
    notes: string,
    pinned_slugs: string[],
  ) => {
    const ok = await post({ action: 'project_note_save', program_area, notes, pinned_slugs })
    if (ok) {
      setProjectNotes(prev => {
        const exists = prev.find(n => n.program_area === program_area)
        if (exists) return prev.map(n => n.program_area === program_area ? { ...n, notes, pinned_slugs } : n)
        return [...prev, { program_area, notes, pinned_slugs }]
      })
    }
  }, [post])

  const visibleTasks = useMemo(
    () => filter === 'all' ? tasks : tasks.filter(t => t.program_area === filter),
    [tasks, filter]
  )

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = {}
    STATUSES.forEach(s => { byStatus[s.id] = tasks.filter(t => t.status === s.id).length })
    return { byStatus, total: tasks.length }
  }, [tasks])

  return (
    <div className="content" style={{ padding: '24px 28px' }}>

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1.5px solid var(--border)' }}>
        {([
          ['board',   'Department Board'],
          ...(!readOnly ? [
            ['mywork',   'My Work'],
            ['projects', 'Projects'],
            ['reports',  'Reports'],
          ] as [Tab, string][] : []),
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

      {/* Department Board */}
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

                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleReorder(col.id, null, false) }}
                  >
                    {colTasks.map(t => (
                      <div
                        key={t.id}
                        draggable={!readOnly}
                        onDragStart={e => { e.stopPropagation(); setDraggingId(t.id) }}
                        onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
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
                        onDrop={e => { e.preventDefault(); e.stopPropagation(); handleReorder(col.id, t.id, dragAbove) }}
                        style={{ opacity: draggingId === t.id ? 0.4 : 1, cursor: readOnly ? 'default' : 'grab' }}
                      >
                        {dragOverId === t.id && dragAbove && draggingId !== t.id && (
                          <div style={{ height: 3, background: '#1a56db', borderRadius: 2, marginBottom: 6, pointerEvents: 'none' }} />
                        )}
                        <TaskCard
                          task={t}
                          readOnly={readOnly}
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

      {/* My Work */}
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

      {/* Projects */}
      {!loading && tab === 'projects' && (
        <ProjectsTab
          tasks={tasks}
          projectNotes={projectNotes}
          onNoteSave={saveProjectNote}
        />
      )}

      {/* Reports */}
      {!loading && tab === 'reports' && (
        <>
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15, color: 'var(--text-primary)' }}>Status summary</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
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

// ── Projects Tab ──────────────────────────────────────────────────────────────

interface ProjectsTabProps {
  tasks: Task[]
  projectNotes: ProjectNote[]
  onNoteSave: (program_area: string, notes: string, pinned_slugs: string[]) => Promise<void>
}

function ProjectsTab({ tasks, projectNotes, onNoteSave }: ProjectsTabProps) {
  const [expandedArea,    setExpandedArea]    = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [previewResource, setPreviewResource] = useState<Resource | null>(null)

  const getNotes = useCallback((area: string): ProjectNote => {
    return projectNotes.find(n => n.program_area === area) ?? { program_area: area, notes: null, pinned_slugs: [] }
  }, [projectNotes])

  const filteredResources = useMemo(() => {
    if (!search.trim()) return DCR_RESOURCES
    const q = search.toLowerCase()
    return DCR_RESOURCES.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      r.tags.some(t => t.toLowerCase().includes(q))
    )
  }, [search])

  return (
    <div>
      {/* Project cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 32 }}>
        {PROGRAM_AREAS.map(area => (
          <ProjectCard
            key={area}
            area={area}
            tasks={tasks.filter(t => t.program_area === area)}
            note={getNotes(area)}
            expanded={expandedArea === area}
            onToggle={() => setExpandedArea(prev => prev === area ? null : area)}
            onNoteSave={onNoteSave}
            onPreviewResource={setPreviewResource}
          />
        ))}
      </div>

      {/* Knowledge base */}
      <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: 24 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 16, flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <h3 style={{ margin: '0 0 3px', fontSize: 15, color: 'var(--text-primary)' }}>Knowledge Base</h3>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              Program documents and resources. Pin any item to a project for quick access.
            </p>
          </div>
          <input
            style={{ ...inputStyle, width: 240 }}
            placeholder="Search resources..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {filteredResources.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No resources match your search.</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filteredResources.map(r => (
            <ResourceCard
              key={r.slug}
              resource={r}
              projectNotes={projectNotes}
              onPreview={() => setPreviewResource(r)}
              onPinToggle={async (program_area: string) => {
                const note = getNotes(program_area)
                const already = note.pinned_slugs.includes(r.slug)
                const updated_slugs = already
                  ? note.pinned_slugs.filter(s => s !== r.slug)
                  : [...note.pinned_slugs, r.slug]
                await onNoteSave(program_area, note.notes ?? '', updated_slugs)
              }}
            />
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {previewResource && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onClick={() => setPreviewResource(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 12, width: '100%', maxWidth: 860,
              maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px', borderBottom: '1px solid var(--border)',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{previewResource.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{previewResource.description}</div>
              </div>
              <button
                onClick={() => setPreviewResource(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-muted)', lineHeight: 1, padding: '0 4px' }}
                aria-label="Close preview"
              >
                &times;
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', minHeight: 480 }}>
              <iframe
                src={previewResource.url}
                style={{ width: '100%', height: '100%', minHeight: 480, border: 'none' }}
                title={previewResource.title}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

interface ProjectCardProps {
  area: string
  tasks: Task[]
  note: ProjectNote
  expanded: boolean
  onToggle: () => void
  onNoteSave: (program_area: string, notes: string, pinned_slugs: string[]) => Promise<void>
  onPreviewResource: (r: Resource) => void
}

function ProjectCard({ area, tasks, note, expanded, onToggle, onNoteSave, onPreviewResource }: ProjectCardProps) {
  const [notes,  setNotes]  = useState(note.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => { setNotes(note.notes ?? '') }, [note.notes])

  const done  = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0

  const pinnedResources = DCR_RESOURCES.filter(r => note.pinned_slugs.includes(r.slug))

  const handleSaveNotes = async () => {
    setSaving(true)
    await onNoteSave(area, notes, note.pinned_slugs)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{area}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: pct === 100 ? '#16a34a' : 'var(--blue)',
                borderRadius: 3, transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {total === 0 ? 'No tasks' : `${done}/${total} done`}
            </span>
          </div>
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1, flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px' }}>

          {/* Tasks */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tasks</div>
            {tasks.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>No tasks yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={`badge ${STATUSES.find(s => s.id === t.status)?.badge ?? 'badge-gray'}`}
                      style={{ fontSize: 10, minWidth: 76, textAlign: 'center', flexShrink: 0 }}
                    >
                      {STATUSES.find(s => s.id === t.status)?.label ?? t.status}
                    </span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-primary)', flex: 1 }}>{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes</div>
            <textarea
              style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add notes, context, or updates for this project..."
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: 7, fontSize: 12, padding: '6px 14px' }}
              disabled={saving}
              onClick={handleSaveNotes}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save notes'}
            </button>
          </div>

          {/* Pinned resources */}
          {pinnedResources.length > 0 && (
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pinned Resources</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {pinnedResources.map(r => (
                  <div
                    key={r.slug}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', background: 'var(--bg-page, #f6f8fb)',
                      borderRadius: 6, border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 10.5, color: 'var(--blue)', fontWeight: 700, minWidth: 28 }}>{r.type}</span>
                    <button
                      onClick={() => onPreviewResource(r)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 12.5, color: 'var(--text-primary)', fontWeight: 600,
                        flex: 1, textAlign: 'left', padding: 0,
                      }}
                    >
                      {r.title}
                    </button>
                    <button
                      onClick={async () => {
                        const updated = note.pinned_slugs.filter(s => s !== r.slug)
                        await onNoteSave(area, notes, updated)
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text-muted)', lineHeight: 1, padding: '0 2px' }}
                      title="Unpin"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Resource card ─────────────────────────────────────────────────────────────

interface ResourceCardProps {
  resource: Resource
  projectNotes: ProjectNote[]
  onPreview: () => void
  onPinToggle: (program_area: string) => Promise<void>
}

function ResourceCard({ resource, projectNotes, onPreview, onPinToggle }: ResourceCardProps) {
  const [pinOpen, setPinOpen] = useState(false)

  const pinnedTo = PROGRAM_AREAS.filter(area => {
    const note = projectNotes.find(n => n.program_area === area)
    return note?.pinned_slugs.includes(resource.slug)
  })

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <button
            onClick={onPreview}
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.3 }}>
              {resource.title}
            </div>
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {resource.description}
          </div>
        </div>
        <span className="badge badge-blue-light" style={{ fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {resource.type}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {resource.tags.map(tag => (
          <span key={tag} className="badge badge-gray" style={{ fontSize: 10 }}>{tag}</span>
        ))}
        {pinnedTo.length > 0 && (
          <span style={{ fontSize: 10.5, color: 'var(--blue)', fontWeight: 600, marginLeft: 2 }}>
            Pinned: {pinnedTo.join(', ')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn"
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid var(--border)', background: 'none' }}
          onClick={onPreview}
        >
          Preview
        </button>
        <button
          className="btn"
          style={{ fontSize: 12, padding: '5px 12px', border: '1px solid var(--border)', background: 'none' }}
          onClick={() => setPinOpen(p => !p)}
        >
          Pin to project {pinOpen ? '▲' : '▼'}
        </button>
      </div>

      {pinOpen && (
        <div style={{
          background: 'var(--bg-page, #f6f8fb)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '6px 4px',
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', padding: '0 10px 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Select project
          </div>
          {PROGRAM_AREAS.map(area => {
            const note = projectNotes.find(n => n.program_area === area)
            const pinned = note?.pinned_slugs.includes(resource.slug) ?? false
            return (
              <button
                key={area}
                onClick={async () => { await onPinToggle(area) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 10px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left', fontSize: 12.5, borderRadius: 4,
                  color: pinned ? 'var(--blue)' : 'var(--text-primary)',
                  fontWeight: pinned ? 700 : 400,
                }}
              >
                <span style={{ fontSize: 12, minWidth: 14, color: pinned ? '#16a34a' : 'var(--text-muted)' }}>
                  {pinned ? '✓' : '+'}
                </span>
                {area}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Task card with inline edit ────────────────────────────────────────────────

interface TaskCardProps {
  task: Task
  readOnly?: boolean
  onStatusChange: (id: string, status: string) => void
  onEdit: (updated: Partial<Task> & { id: string }) => void
  onDelete: (id: string) => void
}

function TaskCard({ task, readOnly, onStatusChange, onEdit, onDelete }: TaskCardProps) {
  const [editing,    setEditing]    = useState(false)
  const [title,      setTitle]      = useState(task.title)
  const [detail,     setDetail]     = useState(task.detail ?? '')
  const [area,       setArea]       = useState<ProgramArea>(task.program_area as ProgramArea)
  const [due,        setDue]        = useState(task.due_date ?? '')
  const [status,     setStatus]     = useState(task.status)
  const [saving,     setSaving]     = useState(false)
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
        <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <label style={labelStyle}>Detail</label>
        <textarea style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }} value={detail} onChange={e => setDetail(e.target.value)} />
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

// ── Add task card ─────────────────────────────────────────────────────────────

function AddTaskCard({ onCreate }: { onCreate: (p: Record<string, unknown>) => void }) {
  const [program_area, setArea]   = useState<string>(PROGRAM_AREAS[0])
  const [title,        setTitle]  = useState('')
  const [detail,       setDetail] = useState('')
  const [due_date,     setDue]    = useState('')

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
      <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing" />
      <label style={labelStyle}>Detail (optional)</label>
      <textarea style={{ ...inputStyle, minHeight: 56, resize: 'vertical' }} value={detail} onChange={e => setDetail(e.target.value)} />
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

// ── Weekly draft card ─────────────────────────────────────────────────────────

function WeeklyDraftCard({ tasks, onSubmit }: { tasks: Task[]; onSubmit: (p: Record<string, unknown>) => void }) {
  const draft = useMemo(() => buildWeeklySummaryDraft(tasks), [tasks])
  const [f, setF] = useState<WeeklyFormData>({ ...draft, week_ending: '' })

  useEffect(() => {
    setF(prev => ({
      ...draft,
      week_ending: prev.week_ending,
      challenges:  prev.challenges || draft.challenges,
      solutions:   prev.solutions  || draft.solutions,
      deadlines:   prev.deadlines  || draft.deadlines,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function ReportLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{label}: </span>
      <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}
