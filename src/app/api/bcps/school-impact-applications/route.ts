import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import {
  SIA_SLUG, SIA_BUCKET, SIA_TABLE, SIA_INBOX, SIA_FROM_NAME, SIA_REVIEW_DAYS, SLOTS, MAX_BYTES, ALLOWED_FILE,
  type Attachments, type Slot, type Status, addBusinessDays, todayEastern, acceptedEmail, needsInfoEmail, TEST_SUBJECT_PREFIX,
} from '@/lib/school-impact'

export const dynamic = 'force-dynamic'

// Public School Impact Application tracker (Widgets hub editor,
// src/components/pages/SchoolImpactApplicationsPage.tsx). Gated like every
// widget editor: superadmin, brand admin, or an 'edit'/'manage' grant on the
// school-impact-application page object, directly or through a group (same
// model as src/app/api/bcps/school-support-lead/route.ts).
//
// GET                  every application, newest first
// PATCH {id, ...}      status changes and staff fields; Accepted starts the
//                      30-business-day clock and emails the applicant;
//                      Needs info stops it and emails the staff note
// POST {action:'file_url', path}            5-minute download link
// POST {action:'upload_url', id, slot, name, size}  staff adds a file
// POST {action:'attach', id, slot, name, path}      records the uploaded file
// DELETE {id}          removes a PRACTICE application (project name starts
//                      with TEST) and its files; real ones are never deletable

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const svc = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BRAND = 'bcps'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])
const STATUSES: Status[] = ['new', 'needs_info', 'accepted', 'letter_sent']

async function requireEditor(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  if (SUPERADMIN_EMAILS.has(user.email ?? '')) return user

  const { data: roleRow } = await svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  if (roleRow?.role === 'superadmin' || roleRow?.role === 'admin') return user

  const { data: obj } = await svc.from('acl_objects').select('id').eq('brand', BRAND).eq('kind', 'page').eq('slug', SIA_SLUG).maybeSingle()
  if (!obj) return null
  const { data: direct } = await svc.from('acl_grants').select('role')
    .eq('object_id', obj.id).eq('subject_type', 'user').eq('subject_id', user.id).maybeSingle()
  if (direct && ['edit', 'manage'].includes(direct.role)) return user
  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  if (gids.length) {
    const { data: gg } = await svc.from('acl_grants').select('role, subject_id').eq('object_id', obj.id).eq('subject_type', 'group')
    if ((gg ?? []).some(g => gids.includes(g.subject_id) && ['edit', 'manage'].includes(g.role))) return user
  }
  return null
}

const s = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from(SIA_TABLE).select('*').order('submitted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ applications: data, today: todayEastern() })
}

export async function PATCH(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = s(body.id, 40)
  const { data: app } = await svc.from(SIA_TABLE).select('*').eq('id', id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { updated_at: now }
  if ('school_board_number' in body) patch.school_board_number = s(body.school_board_number, 100) || null
  if ('staff_notes' in body) patch.staff_notes = s(body.staff_notes) || null
  if ('due_date' in body) {
    if (body.due_date !== null && !isDate(body.due_date)) return NextResponse.json({ error: 'Invalid due date.' }, { status: 400 })
    if (app.status !== 'accepted' && app.status !== 'letter_sent') return NextResponse.json({ error: 'The due date is set when the application is accepted.' }, { status: 400 })
    patch.due_date = body.due_date
    patch.reminder_sent_at = null
  }

  let mail: { subject: string; html: string; kind: string } | null = null
  const status = body.status as Status | undefined
  if (status !== undefined && status !== app.status) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    patch.status = status
    const who = user.email ?? 'staff'
    patch.history = [...(Array.isArray(app.history) ? app.history : []), { at: now, status, by: who }]
    const who4mail = { reference: app.reference, applicant_name: app.applicant_name, project_name: app.project_name }

    if (status === 'accepted') {
      // Determination of completeness: the review clock starts today.
      // Coming back from Letter sent (an undo) keeps the original clock.
      if (app.status !== 'letter_sent' || !app.due_date) {
        patch.accepted_at = now
        patch.due_date = addBusinessDays(todayEastern(), SIA_REVIEW_DAYS)
        patch.reminder_sent_at = null
        patch.needs_info_note = null
        if (body.notify !== false) mail = { ...acceptedEmail(who4mail), kind: 'school-impact-accepted' }
      }
      patch.letter_sent_at = null
    } else if (status === 'needs_info') {
      const note = s(body.note)
      if (!note) return NextResponse.json({ error: 'Say what is missing; it is emailed to the applicant.' }, { status: 400 })
      // The clock stops; it restarts in full when the application is accepted.
      patch.needs_info_note = note
      patch.accepted_at = null
      patch.due_date = null
      patch.reminder_sent_at = null
      if (body.notify !== false) mail = { ...needsInfoEmail({ ...who4mail, note }), kind: 'school-impact-needs-info' }
    } else if (status === 'letter_sent') {
      if (app.status !== 'accepted') return NextResponse.json({ error: 'Accept the application before marking the letter sent.' }, { status: 400 })
      patch.letter_sent_at = now
    } else if (status === 'new') {
      patch.accepted_at = null
      patch.due_date = null
      patch.letter_sent_at = null
    }
  }

  const { data: saved, error } = await svc.from(SIA_TABLE).update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let emailed: boolean | null = null
  if (mail) {
    // A practice application (project name starts with TEST) emails only the
    // address typed in: no copy to the shared inbox.
    const r = await sendEmail({
      to: app.applicant_email, ...(app.is_test ? {} : { cc: SIA_INBOX }), replyTo: SIA_INBOX, fromName: SIA_FROM_NAME,
      subject: (app.is_test ? TEST_SUBJECT_PREFIX : '') + mail.subject, html: mail.html, kind: mail.kind, context: { application_id: app.id, reference: app.reference },
    })
    emailed = r.ok
  }
  return NextResponse.json({ ok: true, application: saved, emailed })
}

export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  if (body.action === 'file_url') {
    const path = s(body.path, 400)
    if (!path.startsWith('applications/')) return NextResponse.json({ error: 'Invalid file.' }, { status: 400 })
    const { data, error } = await svc.storage.from(SIA_BUCKET).createSignedUrl(path, 300, { download: path.split('/').pop() })
    if (error || !data) return NextResponse.json({ error: 'Could not open the file.' }, { status: 500 })
    return NextResponse.json({ url: data.signedUrl })
  }

  const id = s(body.id, 40)
  const slot = s(body.slot, 40) as Slot
  if (!(slot in SLOTS)) return NextResponse.json({ error: 'Invalid file slot.' }, { status: 400 })
  const { data: app } = await svc.from(SIA_TABLE).select('id, attachments').eq('id', id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })

  if (body.action === 'upload_url') {
    const name = s(body.name, 200).replace(/[^\w.\- ]+/g, '_').slice(0, 120)
    const size = Number(body.size)
    if (!name || !ALLOWED_FILE.test(name)) return NextResponse.json({ error: 'That file type is not supported.' }, { status: 400 })
    if (!size || size > MAX_BYTES) return NextResponse.json({ error: 'Files must be 50 MB or smaller.' }, { status: 400 })
    const path = `applications/staff/${id}/${slot}/${Date.now()}-${name}`
    const { data, error } = await svc.storage.from(SIA_BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
    return NextResponse.json({ path, token: data.token, name })
  }

  if (body.action === 'attach') {
    const path = s(body.path, 400)
    if (!path.startsWith(`applications/staff/${id}/${slot}/`)) return NextResponse.json({ error: 'Invalid file.' }, { status: 400 })
    const att = (app.attachments ?? {}) as Attachments
    const next: Attachments = { ...att, [slot]: [...(att[slot] ?? []), { name: s(body.name, 120) || path.split('/').pop()!, path }] }
    const { data: saved, error } = await svc.from(SIA_TABLE).update({ attachments: next, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, application: saved })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  const id = s(body.id, 40)
  const { data: app } = await svc.from(SIA_TABLE).select('id, reference, is_test, attachments').eq('id', id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  if (!app.is_test) return NextResponse.json({ error: 'Only practice applications (project name starting with TEST) can be deleted. Mark a real one Letter sent when it is done.' }, { status: 400 })
  const att = (app.attachments ?? {}) as Attachments
  const paths = Object.values(att).flatMap(list => (list ?? []).map(f => f.path)).filter(p => p.startsWith('applications/'))
  if (paths.length) await svc.storage.from(SIA_BUCKET).remove(paths)
  const { error } = await svc.from(SIA_TABLE).delete().eq('id', id).eq('is_test', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await svc.from('acl_audit').insert({ brand: BRAND, actor_id: user.id, action: 'school-impact-test-deleted', object_id: null, detail: { reference: app.reference, by: user.email } })
  return NextResponse.json({ ok: true })
}
