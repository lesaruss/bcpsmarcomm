import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isDistrictEmail, normalizeDistrictEmail } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'
import { OOC_NOTIFY, calendarRow, calendarEmailRows } from '@/lib/calendar-request'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// MarComm Request Form (Sean, 2026-10-08): replaces the Wufoo MarComm Request
// Form. Submissions land in bcps_marcomm_requests with the next job number,
// continuing the Wufoo numbering.
//
// Open to anyone since 2026-10-20 (Sean: "make this open for the public").
// Signed in, the session address is the requester email and created_by_email.
// Signed out, the requester types a District (@browardschools.com) address:
// it is self-declared, so created_by_email stays empty to mark it unverified.
// A hidden field catches bots, and one address can send RATE_LIMIT requests
// an hour.
//
// Files go straight from the browser to the private marcomm-attachments
// bucket through signed upload URLs (action 'upload_urls'), so large PDFs and
// images never pass through this function's request body limit.

const BUCKET = 'marcomm-attachments'
// Who hears about each new request: OOC_NOTIFY (lib/calendar-request).
// Requests that still come in through the old Wufoo form are not emailed
// here: Wufoo sends its own.
const NOTIFY = OOC_NOTIFY
const esc = (t: string | null | undefined) => (t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const longDate = (d: string | null) => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : null

const MAX_FILES = 5
const RATE_LIMIT = 5
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|heic|mp4|mov|txt)$/i

const SERVICES = [
  'Graphic design', 'Social media', 'BCPS Happenings', 'ParentLink message', 'Press release or media advisory',
  'Video or BECON coverage', 'Photography', 'Livestream', 'Website update or pop-up', 'Event support',
  'Marketing campaign', 'Writing or editing', 'Other',
]
const AUDIENCES = [
  'Students', 'Families', 'Employees', 'Principals and school leaders', 'Community and partners', 'Media', 'School Board', 'Other',
]

function clean(v: unknown, max = 500): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function POST(req: NextRequest) {
  const signedIn = req.headers.get('authorization') ? await requireDistrictUser(req) : null
  if (signedIn && !signedIn.ok) return NextResponse.json({ error: signedIn.error }, { status: signedIn.status })
  const sessionEmail = signedIn?.ok ? signedIn.user.email : null

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  // The hidden "website" field is empty for people; bots fill it in.
  if (clean(body.website)) return NextResponse.json({ ok: true, job_number: 0 })

  const typedEmail = normalizeDistrictEmail(clean(body.requester_email, 200))
  const email = sessionEmail ?? typedEmail
  if (!email || !isDistrictEmail(email)) return NextResponse.json({ error: 'Please use your District email address (@browardschools.com).' }, { status: 400 })

  if (body.action === 'upload_urls') {
    const files = Array.isArray(body.files) ? body.files as { name?: string; size?: number }[] : []
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Attach up to ${MAX_FILES} files.` }, { status: 400 })
    const batch = crypto.randomUUID()
    const out: { name: string; path: string; token: string }[] = []
    for (const f of files) {
      const name = String(f.name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      if (!name || !ALLOWED.test(name)) return NextResponse.json({ error: `${f.name || 'A file'} is not a supported file type.` }, { status: 400 })
      if (!f.size || f.size > MAX_BYTES) return NextResponse.json({ error: `${name} is larger than 25 MB.` }, { status: 400 })
      const path = `requests/${batch}/${name}`
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
      out.push({ name, path, token: data.token })
    }
    return NextResponse.json({ ok: true, uploads: out })
  }

  const title = clean(body.title, 200)
  const description = clean(body.description, 8000)
  const goal = clean(body.goal, 4000)
  const orgType = body.org_type === 'School' || body.org_type === 'Department' ? body.org_type : null
  const orgName = clean(body.org_name, 200)
  const services = (Array.isArray(body.services) ? body.services : []).filter((s): s is string => typeof s === 'string' && SERVICES.includes(s))
  const audiences = (Array.isArray(body.audiences) ? body.audiences : []).filter((s): s is string => typeof s === 'string' && AUDIENCES.includes(s))

  const missing: string[] = []
  if (!clean(body.requester_name, 120)) missing.push('your name')
  if (!orgType || !orgName) missing.push('your school or department')
  if (!title) missing.push('a short title')
  if (!services.length) missing.push('at least one service')
  if (!audiences.length) missing.push('at least one audience')
  if (!description) missing.push('a description')
  if (!goal) missing.push('why it matters')
  if (!isDate(body.date_needed)) missing.push('the date you need it')
  if (missing.length) return NextResponse.json({ error: `Please add ${missing.join(', ')}.` }, { status: 400 })
  // Going on the District calendar: the Calendar Post Request is filled in
  // here too (Sean, 2026-10-20), saved to bcps_calendar_requests and linked.
  const calendar = body.calendar_needed === true ? calendarRow(body.calendar as Record<string, unknown>) : null
  if (calendar && 'error' in calendar) return NextResponse.json({ error: calendar.error }, { status: 400 })

  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a): a is { name: string; path: string } => !!a && typeof a === 'object' && typeof (a as { path?: unknown }).path === 'string'
      && (a as { path: string }).path.startsWith('requests/'))
    .slice(0, MAX_FILES)
    .map(a => ({ name: String(a.name || a.path.split('/').pop()).slice(0, 120), path: a.path }))

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase.from('bcps_marcomm_requests').select('id', { count: 'exact', head: true })
    .ilike('requester_email', email).gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT) return NextResponse.json({ error: 'Too many requests from this address in the last hour. Please try again later.' }, { status: 429 })

  const { data: job, error: jobError } = await supabase.rpc('bcps_marcomm_next_job')
  if (jobError) return NextResponse.json({ error: 'Could not assign a job number.' }, { status: 500 })

  const { data, error } = await supabase.from('bcps_marcomm_requests').insert({
    job_number: job as number,
    source: 'form',
    title,
    requester_name: clean(body.requester_name, 120),
    requester_title: clean(body.requester_title, 120),
    requester_email: email,
    requester_phone: clean(body.requester_phone, 40),
    org_type: orgType,
    org_name: orgName,
    services,
    audiences,
    description,
    goal,
    date_needed: body.date_needed as string,
    event_date: isDate(body.event_date) ? body.event_date : null,
    is_becon: services.includes('Video or BECON coverage'),
    calendar_needed: body.calendar_needed === true,
    calendar_form_submitted: calendar ? true : null,
    attachments,
    status: 'new',
    created_by_email: sessionEmail,
  }).select('id, job_number').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let calendarNumber: number | null = null
  if (calendar && 'row' in calendar) {
    const { data: cal, error: calError } = await supabase.from('bcps_calendar_requests')
      .insert({ ...calendar.row, requester_email: email, created_by_email: sessionEmail, marcomm_request_id: data.id })
      .select('request_number').single()
    if (calError) return NextResponse.json({ error: `Your MarComm request #${data.job_number} was saved, but the calendar post was not: ${calError.message}` }, { status: 500 })
    calendarNumber = cal.request_number
  }

  // The request is saved either way; a failed email is kept in
  // bcps_outbound_emails to resend.
  const name = clean(body.requester_name, 120)
  const row = (label: string, value: string | null) => value ? `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:4px 0">${value}</td></tr>` : ''
  await sendEmail({
    to: NOTIFY,
    replyTo: email,
    subject: `New MarComm Request #${data.job_number}: ${title}`,
    kind: 'marcomm-request-new',
    context: { request_id: data.id, job_number: data.job_number },
    html: `<p>A new MarComm Request came in through bcpsmarcomm.com.</p>
<table style="border-collapse:collapse;font-size:14px">
${row('Request', `#${data.job_number}: ${esc(title)}`)}
${row('From', `${esc(name)}${clean(body.requester_title, 120) ? `, ${esc(clean(body.requester_title, 120))}` : ''} (<a href="mailto:${esc(email)}">${esc(email)}</a>${clean(body.requester_phone, 40) ? `, ${esc(clean(body.requester_phone, 40))}` : ''})${sessionEmail ? '' : ' (not signed in)'}`)}
${row(orgType ?? 'School or department', esc(orgName))}
${row('Needs', esc(services.join(', ')))}
${row('Audience', esc(audiences.join(', ')))}
${row('Needed by', esc(longDate(body.date_needed as string)))}
${row('Event date', esc(longDate(isDate(body.event_date) ? body.event_date : null)))}
${row('Calendar', calendar ? 'Yes, the calendar post details are below' : null)}
${row('Files', attachments.length ? `${esc(attachments.map(a => a.name).join(', '))} (<a href="https://bcpsmarcomm.com/marcomm-assignments?row=${data.id}">download from the request</a>)` : null)}
</table>
<p style="margin:16px 0 4px"><strong>Description</strong></p>
<p style="margin:0;white-space:pre-wrap">${esc(description)}</p>
<p style="margin:16px 0 4px"><strong>Why it matters</strong></p>
<p style="margin:0;white-space:pre-wrap">${esc(goal)}</p>
${calendar && 'row' in calendar ? `<p style="margin:20px 0 4px"><strong>Calendar post</strong></p>
<table style="border-collapse:collapse;font-size:14px">
${calendarEmailRows(calendar.row)}
</table>` : ''}
<p style="margin:20px 0 0"><a href="https://bcpsmarcomm.com/marcomm-assignments?row=${data.id}">Open this request in MarComm Assignments</a>. Reply to this email to reach the requester.</p>`,
  })

  return NextResponse.json({ ok: true, id: data.id, job_number: data.job_number, calendar_number: calendarNumber })
}
