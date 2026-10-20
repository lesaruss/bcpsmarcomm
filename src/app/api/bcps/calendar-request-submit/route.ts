import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isDistrictEmail, normalizeDistrictEmail } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'
import { OOC_NOTIFY, calendarRow, calendarEmailRows } from '@/lib/calendar-request'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Calendar Post Request Form on its own (/calendar-request, Sean,
// 2026-10-20): replaces the Wufoo form. Open like the MarComm Request Form:
// signed in, the session address is the requester; signed out, the requester
// types a District (@browardschools.com) address and created_by_email stays
// empty. A hidden field catches bots, and one address can send RATE_LIMIT
// calendar requests an hour. The Office of Communications is emailed each one.
const RATE_LIMIT = 5

export async function POST(req: NextRequest) {
  const signedIn = req.headers.get('authorization') ? await requireDistrictUser(req) : null
  if (signedIn && !signedIn.ok) return NextResponse.json({ error: signedIn.error }, { status: signedIn.status })
  const sessionEmail = signedIn?.ok ? signedIn.user.email : null

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true, request_number: 0 })

  const typed = normalizeDistrictEmail(typeof body.requester_email === 'string' ? body.requester_email.trim().slice(0, 200) : '')
  const email = sessionEmail ?? typed
  if (!email || !isDistrictEmail(email)) return NextResponse.json({ error: 'Please use your District email address (@browardschools.com).' }, { status: 400 })

  const cal = calendarRow(body.calendar as Record<string, unknown>)
  if ('error' in cal) return NextResponse.json({ error: cal.error }, { status: 400 })

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase.from('bcps_calendar_requests').select('id', { count: 'exact', head: true })
    .ilike('requester_email', email).gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT) return NextResponse.json({ error: 'Too many requests from this address in the last hour. Please try again later.' }, { status: 429 })

  const { data, error } = await supabase.from('bcps_calendar_requests')
    .insert({ ...cal.row, requester_email: email, created_by_email: sessionEmail })
    .select('id, request_number').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sendEmail({
    to: OOC_NOTIFY,
    replyTo: email,
    subject: `New Calendar Post Request: ${cal.row.event_name}`,
    kind: 'calendar-request-new',
    context: { calendar_request_id: data.id, request_number: data.request_number },
    html: `<p>A new Calendar Post Request came in through bcpsmarcomm.com from <a href="mailto:${email}">${email}</a>${sessionEmail ? '' : ' (not signed in)'}.</p>
<table style="border-collapse:collapse;font-size:14px">
${calendarEmailRows(cal.row)}
</table>
<p style="margin:20px 0 0"><a href="https://bcpsmarcomm.com/marcomm-assignments">Open MarComm Assignments &gt; Calendar posts</a>. Reply to this email to reach the requester.</p>`,
  })

  return NextResponse.json({ ok: true, id: data.id, request_number: data.request_number })
}
