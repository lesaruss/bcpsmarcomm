import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

// WCM Composer-access request button (Sean, 2026-09-02): a WCM stuck on a
// hands-on step because they don't yet have a Finalsite Composer login
// clicks one button here instead of hunting down an IT Help Desk ticket -
// this notifies the two people who can actually create the account and
// gives Sean/Felicia the exact signal they need ("this WCM is ready for
// this step, they just need access"), rather than the WCM having to
// self-serve a ticket that lands in a general queue.
//
// One open request per learner per course (unique on user_id, course_id):
// a second click while a request is still pending does not re-email Sean
// and Felicia, it just confirms the existing request. This mirrors the
// once-per-learner guard already used in /api/cert/complete.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Sent to both Sean's LESARUSS inbox and his BCPS/Outlook address (Sean,
// 2026-09-02): he wants this landing in the mailbox he actually checks for
// district business, not only the LESARUSS one. Felicia's BCPS/Outlook
// address was already covered.
const ACCESS_REQUEST_RECIPIENTS = ['contact@lesaruss.com', 'sean.russell@browardschools.com', 'felicia.hicks@browardschools.com']

async function verifyCaller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function GET(req: NextRequest) {
  try {
    const user = await verifyCaller(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const courseId = req.nextUrl.searchParams.get('course_id')
    if (!courseId) return NextResponse.json({ error: 'Missing course_id' }, { status: 400 })

    const { data } = await supabase
      .from('wcm_cert_access_requests')
      .select('status,requested_at')
      .eq('user_id', user.id)
      .eq('course_id', courseId)
      .maybeSingle()

    return NextResponse.json({ ok: true, request: data || null })
  } catch (err) {
    console.error('Access-request GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyCaller(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { course_id, module_id, page_id } = await req.json()
    if (!course_id) return NextResponse.json({ error: 'Missing course_id' }, { status: 400 })

    const { data: existing } = await supabase
      .from('wcm_cert_access_requests')
      .select('status,requested_at')
      .eq('user_id', user.id)
      .eq('course_id', course_id)
      .maybeSingle()

    if (existing && existing.status === 'pending') {
      return NextResponse.json({ ok: true, alreadyRequested: true, requested_at: existing.requested_at })
    }

    const { data: profile } = await supabase
      .from('wcm_cert_users')
      .select('full_name,department,email')
      .eq('user_id', user.id)
      .maybeSingle()
    const email = profile?.email || user.email || null
    const fullName = profile?.full_name || null
    const department = profile?.department || null

    const { error } = await supabase
      .from('wcm_cert_access_requests')
      .upsert(
        {
          user_id: user.id,
          course_id,
          module_id: module_id || null,
          page_id: page_id || null,
          email,
          full_name: fullName,
          department,
          status: 'pending',
          requested_at: new Date().toISOString(),
          resolved_at: null,
          resolved_by: null,
        },
        { onConflict: 'user_id,course_id' }
      )
    if (error) {
      console.error('Access-request upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const mod = module_id ? `Module ${module_id.replace(/^mod/, '')}` : 'the certification course'
    const result = await sendEmail({
      to: ACCESS_REQUEST_RECIPIENTS,
      subject: `Composer access needed: ${fullName || email || 'a WCM'}${department ? ` (${department})` : ''}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
          <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">A WCM in the certification course needs a Finalsite Composer account.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr>
              <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;width:130px;">Name</td>
              <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${fullName || '(not on file)'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Email</td>
              <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${email || '(not on file)'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Department</td>
              <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${department || '(not on file)'}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Stuck at</td>
              <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${mod}${page_id ? `, ${page_id}` : ''}</td>
            </tr>
          </table>
          <p style="margin:0 0 16px;font-size:13px;color:#555;line-height:1.6;">
            They clicked "Request Composer Access" in the course because they don't have a login yet. Once their account is created, they're ready to pick back up where they left off.
          </p>
        </div>
      `,
    })
    if (!result.ok) console.error('Access-request email failed:', result.error)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Access-request POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
