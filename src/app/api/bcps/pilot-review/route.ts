import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isDistrictEmail, normalizeDistrictEmail, isBcpsAdmin } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'
import { escapeHtml } from '@/lib/site-inbox'
import { cleanAnswers, labelOf, PILOT_APPS, TRIED, SIGN_IN, TIME_SPENT, LAUNCH_READY, EASE_LABELS } from '@/lib/pilot-review'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

// WCM Pilot Review feedback (Sean, 2026-11-16), behind /pilot-review.
// POST is open like the Calendar Post Request Form: a pilot WCM who could not
// sign in still has to be able to say so. Signed in, the session address is
// the respondent; signed out, they type a District address. A hidden field
// catches bots and one address can send RATE_LIMIT responses an hour. Each
// response emails the WCM's District Web Team lead and the pilot organizer.
// GET tells the page who is looking (their pilot row, if any) and, for the
// District Web Team, admins and the SuperAdmin, returns every response with
// the pilot roster so the team sees who has not answered yet.
const RATE_LIMIT = 3
const ORGANIZER = 'vanessa.deslandes@browardschools.com'
const OWNER = 'sean.russell@browardschools.com'

async function canSeeResults(userId: string): Promise<boolean> {
  if (await isBcpsAdmin(userId)) return true
  const { data: g } = await svc.from('acl_groups').select('id').eq('brand', 'bcps').eq('name', 'District Web Team').maybeSingle()
  if (!g) return false
  const { data: m } = await svc.from('acl_group_members').select('user_id').eq('group_id', g.id).eq('user_id', userId).maybeSingle()
  return !!m
}

export async function GET(req: NextRequest) {
  if (!req.headers.get('authorization')) return NextResponse.json({ ok: true, signed_in: false })
  const auth = await requireDistrictUser(req)
  if (!auth.ok) return NextResponse.json({ ok: true, signed_in: false })
  const email = auth.user.email
  const [{ data: me }, { count }, results] = await Promise.all([
    svc.from('bcps_pilot_review_members').select('full_name, school_name, lead_name').eq('email', email).maybeSingle(),
    svc.from('bcps_pilot_review_responses').select('id', { count: 'exact', head: true }).ilike('email', email),
    canSeeResults(auth.user.userId),
  ])
  const out: Record<string, unknown> = { ok: true, signed_in: true, email, pilot: me ?? null, already_sent: (count ?? 0) > 0, can_see_results: results }
  // ?results=1 is also the District Web Team Guide's check for showing its
  // Pilot Review item, so anyone who cannot see the results gets a 403.
  if (req.nextUrl.searchParams.get('results') === '1' && !results) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (results && req.nextUrl.searchParams.get('results') === '1') {
    const [{ data: roster }, { data: responses }, { data: users }] = await Promise.all([
      svc.from('bcps_pilot_review_members').select('email, full_name, school_name, loc_no, lead_name').order('lead_name').order('school_name'),
      svc.from('bcps_pilot_review_responses').select('*').order('created_at', { ascending: false }),
      svc.auth.admin.listUsers({ perPage: 1000 }),
    ])
    const accounts = new Map((users?.users ?? []).filter(u => u.email).map(u => [u.email!.toLowerCase(), u]))
    out.roster = (roster ?? []).map(r => {
      const u = accounts.get(r.email)
      return {
        ...r,
        has_account: !!u,
        last_sign_in_at: u?.last_sign_in_at ?? null,
        responded: (responses ?? []).some(x => (x.email || '').toLowerCase() === r.email),
      }
    })
    out.responses = responses ?? []
  }
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const signedIn = req.headers.get('authorization') ? await requireDistrictUser(req) : null
  if (signedIn && !signedIn.ok) return NextResponse.json({ error: signedIn.error }, { status: signedIn.status })
  const sessionEmail = signedIn?.ok ? signedIn.user.email : null

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const typed = normalizeDistrictEmail(typeof body.email === 'string' ? body.email.trim().slice(0, 200) : '')
  const email = (sessionEmail ?? typed ?? '').toLowerCase()
  if (!email || !isDistrictEmail(email)) return NextResponse.json({ error: 'Please use your District email address (@browardschools.com).' }, { status: 400 })

  const cleaned = cleanAnswers(body.answers)
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const rating = typeof body.overall_rating === 'number' && body.overall_rating >= 1 && body.overall_rating <= 5 ? Math.round(body.overall_rating) : null
  if (rating == null) return NextResponse.json({ error: 'Please give an overall rating.' }, { status: 400 })
  const launch = typeof body.launch_ready === 'string' && LAUNCH_READY.some(x => x.id === body.launch_ready) ? body.launch_ready : null
  if (!launch) return NextResponse.json({ error: 'Please tell us whether it is ready for every school.' }, { status: 400 })

  const { data: pilot } = await svc.from('bcps_pilot_review_members').select('full_name, school_name, lead_name, lead_email').eq('email', email).maybeSingle()
  const name = (typeof body.full_name === 'string' ? body.full_name.trim().slice(0, 120) : '') || pilot?.full_name || ''
  const school = (typeof body.school_name === 'string' ? body.school_name.trim().slice(0, 160) : '') || pilot?.school_name || ''
  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!school) return NextResponse.json({ error: 'Please enter your school.' }, { status: 400 })

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await svc.from('bcps_pilot_review_responses').select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', since)
  if ((count ?? 0) >= RATE_LIMIT) return NextResponse.json({ error: 'Too many responses from this address in the last hour. Please try again later.' }, { status: 429 })

  const { data, error } = await svc.from('bcps_pilot_review_responses').insert({
    email, user_id: signedIn?.ok ? signedIn.user.userId : null, full_name: name, school_name: school,
    is_pilot_member: !!pilot, overall_rating: rating, launch_ready: launch,
    follow_up_ok: body.follow_up_ok === true, answers: cleaned.answers,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Could not save your feedback. Please try again.' }, { status: 500 })

  const a = cleaned.answers
  const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(v || '—').replace(/\n/g, '<br>')}</td></tr>`
  const appRows = PILOT_APPS.map(p => {
    const x = a.apps[p.id]
    return row(p.label, `${labelOf(TRIED, x.tried)}${x.ease ? `, ${EASE_LABELS[x.ease - 1]}` : ''}`)
      + (x.confusing ? row('  Confusing', x.confusing) : '') + (x.better ? row('  Better if', x.better) : '')
  }).join('')
  const to = Array.from(new Set([pilot?.lead_email, ORGANIZER, OWNER].filter(Boolean) as string[]))
  await sendEmail({
    to, replyTo: email,
    subject: `WCM Pilot Review feedback: ${name}, ${school}`,
    kind: 'pilot-review-response',
    context: { pilot_review_response_id: data.id },
    html: `<p><b>${escapeHtml(name)}</b> (${escapeHtml(school)}) sent WCM Pilot Review feedback${pilot ? '' : ' (not on the pilot list)'}.</p>
<table style="border-collapse:collapse;font-size:14px">
${row('Overall', `${rating} of 5`)}${row('Ready for every school', labelOf(LAUNCH_READY, launch))}${row('Signing in', labelOf(SIGN_IN, a.sign_in))}${a.sign_in_notes ? row('  Notes', a.sign_in_notes) : ''}
${appRows}
${row('Time spent', labelOf(TIME_SPENT, a.time_spent))}${row('Fix first', a.top_fix)}${row('Anything else', a.anything_else)}${row('OK to follow up', body.follow_up_ok === true ? 'Yes' : 'No')}
</table>
<p style="margin:20px 0 0"><a href="https://bcpsmarcomm.com/pilot-review?view=results">See every response</a>. Reply to this email to reach ${escapeHtml(name)}.</p>`,
  })

  return NextResponse.json({ ok: true, id: data.id })
}
