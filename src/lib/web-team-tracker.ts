import type { SupabaseClient } from '@supabase/supabase-js'

// Web Team Assignments as people see it (2026-10-21). The page is still the
// static public/bcps-web-team-assignments.html, but rows added by a meeting
// transcript upload (bcps_meeting_uploads -> bcps_web_team_apply_meeting_update)
// live only in bcps_assignment_tags, and a meeting can rewrite a row's
// description. trackerHtml() serves the file with both merged into the newest
// section, so the page's own scripts pick the new rows up like any other:
// status, tags, notes, dates and filters all work on them unchanged.

const STATUS_LABELS: Record<string, string> = {
  'in-progress': 'In Progress', pending: 'Pending', ongoing: 'Ongoing', completed: 'Completed', archived: 'Archived',
}

interface TagRow {
  assignment_slug: string
  title_override: string | null
  description_override: string | null
  lead_override: string | null
  support_override: string[] | null
  status: string | null
  team_ooc: boolean | null
  team_app_services: boolean | null
  priority: string | null
  added_from_meeting: string | null
  added_at: string | null
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export async function fetchStaticTracker(origin: string): Promise<string> {
  const res = await fetch(`${origin}/bcps-web-team-assignments.html`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`tracker file ${res.status}`)
  return res.text()
}

// The newest section is the one whose buttons call the highest toggleTagN(),
// the same test parseAssignmentsHtml uses.
function newestVersion(html: string): number {
  const versions = Array.from(html.matchAll(/toggleTag(\d+)\(/g)).map((m) => Number(m[1]))
  return versions.length ? Math.max(...versions) : 0
}

function rowHtml(t: TagRow, v: number): string {
  const slug = esc(t.assignment_slug)
  const title = esc(t.title_override || t.assignment_slug)
  const desc = esc(t.description_override || '')
  const lead = t.lead_override || ''
  const support = (t.support_override || []).join(', ')
  const status = STATUS_LABELS[t.status || ''] ? (t.status as string) : 'pending'
  const statusMenu = ['in-progress', 'pending', 'ongoing', 'completed']
    .map((s) => `<button type="button" class="${s === status ? 'current' : ''}" data-status="${s}" onclick="chooseStatus${v}(event,this)">${STATUS_LABELS[s]}</button>`)
    .join('')
  const pri = (p: string, label: string) =>
    `<button type="button" class="priority-pill ${p}${t.priority === p ? ' on' : ''}" data-slug="${slug}" data-priority="${p}" onclick="setPriority${v}(this)">${label}</button>`
  return `
      <div class="assignment-row" data-slug="${slug}" data-team="General" data-lead="${esc(lead)}" onclick="openNotes(this)">
        <div><div class="assignment-name">${title}</div><div class="assignment-desc">${desc}</div><button class="notes-btn notes-btn-stacked" tabindex="-1"><span class="notes-icon">&#128221;</span> Notes <span class="note-count" id="nc${v}-${slug}"></span></button></div>
        <div class="assignment-lead-support" data-slug="${slug}" onclick="event.stopPropagation(); openLeadEditor(this)" tabindex="0" role="button" title="Click to edit lead/support"><div class="assignment-lead">${esc(lead || '-')}</div>${support ? `<div class="assignment-support">${esc(support)}</div>` : ''}</div>
        <div class="deadline-cell" data-slug="${slug}"><div class="date-line"><span class="date-label">Start:</span> <span class="assignment-start" data-slug="${slug}" onclick="event.stopPropagation(); openDeadlineEditor(this)" tabindex="0" role="button" title="Click to edit start date">Not set</span></div><div class="date-line"><span class="date-label">Deadline:</span> <span class="assignment-deadline" data-slug="${slug}" onclick="event.stopPropagation(); openDeadlineEditor(this)" tabindex="0" role="button" title="Click to edit deadline">Not set</span></div><span class="overdue-badge" data-slug="${slug}" style="display:none" onclick="dismissOverdue(event, this)" title="Click to dismiss overdue flag">OVERDUE</span></div>
        <div><div class="status-control" data-slug="${slug}" onclick="event.stopPropagation()"><button type="button" class="status-badge-btn ${status}" onclick="toggleStatusMenu${v}(event, this)">${STATUS_LABELS[status]} <span class="status-caret">&#9662;</span></button><div class="status-menu">${statusMenu}</div></div></div>
        <div class="tag-controls" onclick="event.stopPropagation()" data-tagcell="${slug}"><div class="tag-toggle-row"><button type="button" class="tag-toggle ooc${t.team_ooc ? ' on' : ''}" data-slug="${slug}" data-field="ooc" onclick="toggleTag${v}(this)">OOC</button><button type="button" class="tag-toggle app${t.team_app_services ? ' on' : ''}" data-slug="${slug}" data-field="app" onclick="toggleTag${v}(this)">App Svc</button></div><div class="priority-row">${pri('high', 'H')}${pri('medium', 'M')}${pri('low', 'L')}</div></div>
      </div>`
}

export async function trackerHtml(svc: SupabaseClient, origin: string): Promise<string> {
  const html = await fetchStaticTracker(origin)
  const { data } = await svc.from('bcps_assignment_tags')
    .select('assignment_slug, title_override, description_override, lead_override, support_override, status, team_ooc, team_app_services, priority, added_from_meeting, added_at')
    .or('added_from_meeting.not.is.null,description_override.not.is.null')
  const tags = (data ?? []) as TagRow[]
  if (!tags.length) return html
  return mergeMeetingRows(html, tags)
}

export function mergeMeetingRows(html: string, tags: TagRow[]): string {
  const v = newestVersion(html)
  const snapStart = html.indexOf(`id="snap-v${v}"`)
  const completedAt = html.indexOf(`id="v${v}-completed-accordion"`)
  if (!v || snapStart < 0 || completedAt < 0) return html
  // The active list's closing </div> sits just before the Completed accordion.
  const insertAt = html.lastIndexOf('</div>', html.lastIndexOf('<details', completedAt))
  if (insertAt < snapStart) return html

  let head = html.slice(0, insertAt)
  const tail = html.slice(insertAt)
  const newest = html.slice(snapStart)

  // A meeting's new description for a row already on the page.
  for (const t of tags) {
    if (!t.description_override) continue
    const marker = `<div class="assignment-row" data-slug="${t.assignment_slug}"`
    const at = head.indexOf(marker, snapStart)
    if (at < 0) continue
    const nextRow = head.indexOf('<div class="assignment-row"', at + marker.length)
    const descAt = head.indexOf('<div class="assignment-desc">', at)
    const descEnd = descAt < 0 ? -1 : head.indexOf('</div>', descAt)
    if (descAt < 0 || descEnd < 0 || (nextRow >= 0 && descAt > nextRow)) continue
    head = head.slice(0, descAt) + `<div class="assignment-desc">${esc(t.description_override)}` + head.slice(descEnd)
  }

  // Rows that exist only in the database, oldest first so new ones land last.
  const added = tags
    .filter((t) => t.added_from_meeting && !newest.includes(`data-slug="${t.assignment_slug}"`))
    .sort((a, b) => (a.added_at || '').localeCompare(b.added_at || ''))
  return head + added.map((t) => rowHtml(t, v)).join('') + '\n    ' + tail
}
