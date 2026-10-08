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

const STATUSES = ['new', 'needs_info', 'assigned', 'in_progress', 'in_review', 'scheduled', 'on_hold', 'completed', 'declined'] as const
const CLOSED = new Set(['completed', 'declined'])

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

  const [{ data: requests, error }, { data: notes, error: notesError }] = await Promise.all([
    supabase.from('bcps_marcomm_requests').select('*').order('submitted_at', { ascending: false }),
    supabase.from('bcps_marcomm_request_notes').select('id, request_id, body, author, created_at').order('created_at', { ascending: false }),
  ])
  if (error || notesError) return NextResponse.json({ error: (error || notesError)!.message }, { status: 500 })

  const res = NextResponse.json({ ok: true, requests: requests ?? [], notes: notes ?? [] })
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
    const { status, lead, support, date_needed } = body as Record<string, string | null | undefined>
    if (status !== undefined) {
      if (!STATUSES.includes(status as typeof STATUSES[number])) return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
      patch.status = status
      patch.completed_at = CLOSED.has(status as string) ? new Date().toISOString() : null
    }
    if (lead !== undefined) patch.lead = (lead || '').trim() || null
    if (support !== undefined) patch.support = (support || '').trim() || null
    if (date_needed !== undefined) patch.date_needed = date_needed || null
    // Every assignment and date change is written to the notes log, so the
    // history the spreadsheet's Status column used to carry is kept.
    const { data: before } = await supabase.from('bcps_marcomm_requests')
      .select('status, lead, support, date_needed').eq('id', id).single()
    const { error } = await supabase.from('bcps_marcomm_requests').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const changes: string[] = []
    if (status !== undefined && status !== before?.status) changes.push(`Status changed to ${statusLabel(status as string)}.`)
    for (const [key, label] of [['lead', 'Lead'], ['support', 'Support'], ['date_needed', 'Date needed']] as const) {
      if (!(key in patch)) continue
      const next = (patch[key] as string | null) ?? null
      const prev = (before?.[key] as string | null) ?? null
      if (next !== prev) changes.push(next ? `${label} set to ${next}${prev ? ` (was ${prev})` : ''}.` : `${label} cleared${prev ? ` (was ${prev})` : ''}.`)
    }
    if (changes.length) {
      await supabase.from('bcps_marcomm_request_notes').insert({ request_id: id, body: changes.join(' '), author: auth.user.email })
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'add_note') {
    const text = String((body as { body?: string }).body || '').trim()
    if (!id || !text) return NextResponse.json({ error: 'id and note required' }, { status: 400 })
    const { data, error } = await supabase.from('bcps_marcomm_request_notes')
      .insert({ request_id: id, body: text.slice(0, 5000), author: auth.user.email })
      .select('id, request_id, body, author, created_at').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase.from('bcps_marcomm_requests').update({ updated_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, note: data })
  }

  // Work the team starts itself (the spreadsheet's "Added for tracking
  // purposes" rows): no job number, source 'internal'.
  if (action === 'create_internal') {
    const { title, description, lead, date_needed } = body as Record<string, string | undefined>
    if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
    const { data, error } = await supabase.from('bcps_marcomm_requests').insert({
      source: 'internal', title: title.trim().slice(0, 200), description: description?.trim() || null,
      lead: lead?.trim() || null, date_needed: date_needed || null,
      status: lead?.trim() ? 'assigned' : 'new', created_by_email: auth.user.email,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

function statusLabel(s: string): string {
  return ({
    new: 'New', needs_info: 'Needs Info', assigned: 'Assigned', in_progress: 'In Progress', in_review: 'In Review',
    scheduled: 'Scheduled', on_hold: 'On Hold', completed: 'Completed', declined: 'Declined',
  } as Record<string, string>)[s] || s
}
