import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// MarComm Assignments (Sean, 2026-10-08): the Office of Communications request
// tracker that replaces the MarComm Spreadsheet. Rows carry employee contact
// details, so every read and write is gated on the 'marcomm-assignments' page
// grant (District Web Team and Office of Communications groups; admins pass by
// role) - the same check the page itself uses, per
// canon-gate-new-surfaces-on-the-same-check (requireBcpsPageAccess in
// src/lib/bcps-auth.ts).

const PAGE = 'marcomm-assignments'
const BUCKET = 'marcomm-attachments'
const ALLOWED_FILE = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|heic|mp4|mov|txt)$/i

const STATUSES = ['new', 'needs_info', 'assigned', 'in_progress', 'in_review', 'scheduled', 'on_hold', 'completed', 'declined'] as const
const CLOSED = new Set(['completed', 'declined'])
const PRIORITIES = ['high', 'medium', 'low']

// Date submitted (start_date) defaults to the day the request came in, Eastern
// (Sean, 2026-10-21); the team can change it in the drawer.
const todayEastern = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export async function GET(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // ?attachment=<storage path> returns a short-lived download link.
  const attachment = req.nextUrl.searchParams.get('attachment')
  if (attachment) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachment, 300)
    if (error || !data) return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, url: data.signedUrl })
  }

  // team: the roster from the weekly Marcomm Meeting (bcps_marcomm_team), used
  // for the Lead and Support dropdowns and the "My items" view; me is the
  // signed-in email so the page can find the viewer on that roster.
  // ?snapshot=<id> returns one saved version of the tracker ("View as of").
  const snapshot = req.nextUrl.searchParams.get('snapshot')
  if (snapshot) {
    const { data, error } = await supabase.from('bcps_marcomm_snapshots')
      .select('id, meeting_date, label, summary, source, data, created_at').eq('id', snapshot).single()
    if (error || !data) return NextResponse.json({ error: 'Version not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, snapshot: data })
  }

  const [{ data: requests, error }, { data: notes, error: notesError }, { data: team, error: teamError }, { data: snapshots, error: snapError }] = await Promise.all([
    supabase.from('bcps_marcomm_requests').select('*').order('submitted_at', { ascending: false }),
    supabase.from('bcps_marcomm_request_notes').select('id, request_id, body, author, source, meeting_label, created_at, edited_at, edited_by').order('created_at', { ascending: false }),
    supabase.from('bcps_marcomm_team').select('name, email, kind').eq('active', true).order('sort_order').order('name'),
    supabase.from('bcps_marcomm_snapshots').select('id, meeting_date, label, summary, source, created_at')
      .order('meeting_date', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const failed = error || notesError || teamError || snapError
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 })

  const res = NextResponse.json({ ok: true, requests: requests ?? [], notes: notes ?? [], team: team ?? [], snapshots: snapshots ?? [], me: auth.user.email })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const { action, id } = body as { action?: string; id?: string }

  if (action === 'update') {
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const { status, lead, support, date_needed, start_date, priority, link_url, title, description, goal } = body as Record<string, string | null | undefined>
    const { is_ongoing, overdue_dismissed } = body as Record<string, boolean | undefined>
    if (status !== undefined) {
      if (!STATUSES.includes(status as typeof STATUSES[number])) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
      patch.status = status
      patch.completed_at = CLOSED.has(status as string) ? new Date().toISOString() : null
    }
    if (lead !== undefined) patch.lead = (lead || '').trim() || null
    if (support !== undefined) patch.support = (support || '').trim() || null
    if (date_needed !== undefined) patch.date_needed = date_needed || null
    if (start_date !== undefined) patch.start_date = start_date || null
    if (priority !== undefined) {
      if (priority && !PRIORITIES.includes(priority)) return NextResponse.json({ error: 'Unknown priority.' }, { status: 400 })
      patch.priority = priority || null
    }
    if (link_url !== undefined) {
      const url = (link_url || '').trim()
      if (url && !/^https:\/\//i.test(url)) return NextResponse.json({ error: 'Links must start with https://' }, { status: 400 })
      patch.link_url = url || null
    }
    if (title !== undefined) {
      const t = (title || '').trim()
      if (!t) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })
      patch.title = t.slice(0, 200)
    }
    // The request text itself (Jennifer Hodder, 2026-10-22): the team corrects
    // or updates what was submitted.
    if (description !== undefined) patch.description = (description || '').trim().slice(0, 8000) || null
    if (goal !== undefined) patch.goal = (goal || '').trim().slice(0, 4000) || null
    if (is_ongoing !== undefined) patch.is_ongoing = !!is_ongoing
    if (overdue_dismissed !== undefined) patch.overdue_dismissed = !!overdue_dismissed
    // A new date needed brings the overdue flag back.
    if (date_needed !== undefined && overdue_dismissed === undefined) patch.overdue_dismissed = false
    // Every assignment and date change is written to the notes log, so the
    // history the spreadsheet's Status column used to carry is kept.
    const { data: before } = await supabase.from('bcps_marcomm_requests')
      .select('status, lead, support, date_needed, start_date, priority, title, is_ongoing').eq('id', id).single()
    const { error } = await supabase.from('bcps_marcomm_requests').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const changes: string[] = []
    if (status !== undefined && status !== before?.status) changes.push(`Status changed to ${statusLabel(status as string)}.`)
    for (const [key, label] of [['title', 'Title'], ['lead', 'Lead'], ['support', 'Support'], ['date_needed', 'Date needed'], ['start_date', 'Date submitted'], ['priority', 'Priority']] as const) {
      if (!(key in patch)) continue
      const next = (patch[key] as string | null) ?? null
      const prev = (before?.[key] as string | null) ?? null
      if (next !== prev) changes.push(next ? `${label} set to ${next}${prev ? ` (was ${prev})` : ''}.` : `${label} cleared${prev ? ` (was ${prev})` : ''}.`)
    }
    if ('description' in patch) changes.push('Request text edited.')
    if ('goal' in patch) changes.push('"Why it matters" edited.')
    if ('is_ongoing' in patch && patch.is_ongoing !== before?.is_ongoing) changes.push(patch.is_ongoing ? 'Marked ongoing.' : 'No longer ongoing.')
    if (changes.length) {
      await supabase.from('bcps_marcomm_request_notes').insert({ request_id: id, body: changes.join(' '), author: auth.user.email, source: 'system' })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'add_note') {
    const text = String((body as { body?: string }).body || '').trim()
    if (!id || !text) return NextResponse.json({ error: 'id and note required' }, { status: 400 })
    const { data, error } = await supabase.from('bcps_marcomm_request_notes')
      .insert({ request_id: id, body: text.slice(0, 5000), author: auth.user.email, source: (body as { source?: string }).source === 'dictated' ? 'dictated' : 'typed' })
      .select('id, request_id, body, author, source, meeting_label, created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('bcps_marcomm_requests').update({ updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, note: data })
  }

  // The team adds files to a request (Jennifer Hodder, 2026-10-21), the
  // same way the request form does: upload_urls hands out one-file signed
  // upload links into the private bucket, then add_attachments records them.
  if (action === 'upload_urls') {
    const files = Array.isArray((body as { files?: unknown }).files) ? (body as { files: { name?: string; size?: number }[] }).files : []
    if (!id || !files.length || files.length > 5) return NextResponse.json({ error: 'Add up to 5 files at a time.' }, { status: 400 })
    const batch = crypto.randomUUID()
    const uploads: { name: string; path: string; token: string }[] = []
    for (const f of files) {
      const name = String(f.name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      if (!name || !ALLOWED_FILE.test(name)) return NextResponse.json({ error: `${f.name || 'A file'} is not a supported file type.` }, { status: 400 })
      if (!f.size || f.size > 25 * 1024 * 1024) return NextResponse.json({ error: `${name} is larger than 25 MB.` }, { status: 400 })
      const path = `requests/${batch}/${name}`
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
      uploads.push({ name, path, token: data.token })
    }
    return NextResponse.json({ ok: true, uploads })
  }

  if (action === 'add_attachments') {
    const files = (Array.isArray((body as { files?: unknown }).files) ? (body as { files: { name?: string; path?: string }[] }).files : [])
      .filter(f => typeof f.path === 'string' && f.path.startsWith('requests/')).slice(0, 5)
      .map(f => ({ name: String(f.name || f.path!.split('/').pop()).slice(0, 120), path: f.path as string }))
    if (!id || !files.length) return NextResponse.json({ error: 'id and files required' }, { status: 400 })
    const { data: row } = await supabase.from('bcps_marcomm_requests').select('attachments').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    const now = new Date().toISOString()
    const { error } = await supabase.from('bcps_marcomm_requests')
      .update({ attachments: [...(Array.isArray(row.attachments) ? row.attachments : []), ...files], updated_at: now }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('bcps_marcomm_request_notes').insert({ request_id: id, author: auth.user.email, source: 'system', body: `Added ${files.length === 1 ? 'a file' : `${files.length} files`}: ${files.map(f => f.name).join(', ')}.` })
    return NextResponse.json({ ok: true })
  }

  // Correct a note someone typed or dictated, or a meeting note (Marketing meeting, Sean,
  // 2026-10-20). System and meeting notes are the record and stay as they are.
  if (action === 'edit_note') {
    const { note_id } = body as { note_id?: string }
    const text = String((body as { body?: string }).body || '').trim()
    if (!note_id || !text) return NextResponse.json({ error: 'note_id and note required' }, { status: 400 })
    const { data: note } = await supabase.from('bcps_marcomm_request_notes').select('id, request_id, source').eq('id', note_id).maybeSingle()
    if (!note) return NextResponse.json({ error: 'Note not found.' }, { status: 404 })
    // Meeting notes too (2026-10-22); the automatic system lines stay as recorded.
    if (note.source === 'system') return NextResponse.json({ error: 'Automatic history lines cannot be edited.' }, { status: 400 })
    const { error } = await supabase.from('bcps_marcomm_request_notes')
      .update({ body: text.slice(0, 5000), edited_at: new Date().toISOString(), edited_by: auth.user.email }).eq('id', note_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Combine records (Marketing meeting, Sean, 2026-10-20): other_id is folded
  // into id, the request that stays. Its notes and attachments move over, its
  // description is kept as a note, and it leaves the tracker. Nothing is
  // deleted: the folded row keeps merged_into, merged_at and merged_by.
  if (action === 'combine') {
    const { other_id } = body as { other_id?: string }
    if (!id || !other_id || id === other_id) return NextResponse.json({ error: 'Pick the request to combine with.' }, { status: 400 })
    const { data: rows } = await supabase.from('bcps_marcomm_requests')
      .select('id, job_number, title, requester_name, submitted_at, description, attachments, merged_into').in('id', [id, other_id])
    const keep = rows?.find(r => r.id === id)
    const fold = rows?.find(r => r.id === other_id)
    if (!keep || !fold) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
    if (keep.merged_into || fold.merged_into) return NextResponse.json({ error: 'One of these was already combined into another request.' }, { status: 409 })
    const now = new Date().toISOString()
    const label = fold.job_number ? `#${fold.job_number}` : 'a team item'
    const { error: moveError } = await supabase.from('bcps_marcomm_request_notes').update({ request_id: keep.id }).eq('request_id', fold.id)
    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 })
    const files = [...(Array.isArray(keep.attachments) ? keep.attachments : []), ...(Array.isArray(fold.attachments) ? fold.attachments : [])]
    await supabase.from('bcps_marcomm_requests').update({ attachments: files, updated_at: now }).eq('id', keep.id)
    const { error: foldError } = await supabase.from('bcps_marcomm_requests')
      .update({ merged_into: keep.id, merged_at: now, merged_by: auth.user.email, updated_at: now }).eq('id', fold.id)
    if (foldError) return NextResponse.json({ error: foldError.message }, { status: 500 })
    const from = [fold.requester_name, fold.submitted_at ? `submitted ${longDate(String(fold.submitted_at).slice(0, 10))}` : null].filter(Boolean).join(', ')
    await supabase.from('bcps_marcomm_request_notes').insert({
      request_id: keep.id, author: auth.user.email, source: 'system',
      body: `Combined with ${label}: ${fold.title}${from ? ` (${from})` : ''}. Its notes and files are here now.${fold.description ? `\n\nIts request: ${fold.description}` : ''}`.slice(0, 5000),
    })
    return NextResponse.json({ ok: true })
  }

  // Work the team starts itself (the spreadsheet's "Added for tracking
  // purposes" rows): no job number, source 'internal'.
  if (action === 'create_internal') {
    const { title, description, lead, date_needed } = body as Record<string, string | undefined>
    if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
    const { data, error } = await supabase.from('bcps_marcomm_requests').insert({
      source: 'internal', title: title.trim().slice(0, 200), description: description?.trim() || null,
      lead: lead?.trim() || null, date_needed: date_needed || null, start_date: todayEastern(),
      status: lead?.trim() ? 'assigned' : 'new', created_by_email: auth.user.email,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  // Save the tracker as it stands now under a meeting date, for meetings that
  // were not recorded (recorded Marcomm Meetings are snapshotted when their
  // transcript is applied, by bcps_marcomm_apply_meeting_update).
  if (action === 'snapshot') {
    const { meeting_date, label, summary } = body as Record<string, string | undefined>
    if (!meeting_date || !/^\d{4}-\d{2}-\d{2}$/.test(meeting_date)) return NextResponse.json({ error: 'Choose the meeting date.' }, { status: 400 })
    const name = (label || '').trim() || 'Marcomm Meeting'
    const { data, error } = await supabase.rpc('bcps_marcomm_take_snapshot', {
      p_meeting_date: meeting_date, p_label: `${longDate(meeting_date)}: ${name.slice(0, 120)}`,
      p_summary: (summary || '').trim().slice(0, 4000) || null, p_source: 'manual', p_created_by: auth.user.email,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function statusLabel(s: string): string {
  return ({
    new: 'New', needs_info: 'Needs Info', assigned: 'Assigned', in_progress: 'In Progress', in_review: 'In Review',
    scheduled: 'Scheduled', on_hold: 'On Hold', completed: 'Completed', declined: 'Declined',
  } as Record<string, string>)[s] || s
}
