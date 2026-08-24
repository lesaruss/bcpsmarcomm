import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Sean gets copied on every certificate-issued notification so he has a
// heads-up without needing to check the admin dashboard (Sean, 2026-08-20).
const CERT_NOTIFY_CC = 'contact@lesaruss.com'

export async function POST(req: NextRequest) {
  try {
    const { user_id, course_id } = await req.json()
    if (!user_id || !course_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // Check first so the completion email only ever fires once per learner,
    // even though this endpoint can be called more than once for the same
    // person (e.g. a page refresh re-triggering the all-pages-complete check).
    const { data: existing } = await supabase
      .from('wcm_certifications')
      .select('user_id')
      .eq('user_id', user_id)
      .eq('course_id', course_id)
      .maybeSingle()

    const { error } = await supabase
      .from('wcm_certifications')
      .upsert({ user_id, course_id }, { onConflict: 'user_id,course_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!existing) {
      const { data: cert } = await supabase
        .from('wcm_certifications')
        .select('issued_at,expires_at')
        .eq('user_id', user_id)
        .eq('course_id', course_id)
        .maybeSingle()
      const { data: authUser } = await supabase.auth.admin.getUserById(user_id)
      const { data: profile } = await supabase
        .from('wcm_cert_users')
        .select('full_name,department,email')
        .eq('user_id', user_id)
        .maybeSingle()

      const learnerEmail = profile?.email || authUser?.user?.email
      if (learnerEmail && cert) {
        const issuedDate = new Date(cert.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const expiresDate = new Date(cert.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        const name = profile?.full_name || learnerEmail
        const result = await sendEmail({
          to: learnerEmail,
          cc: CERT_NOTIFY_CC,
          subject: 'You’re certified: BCPS Department WCM Certification',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
              <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">Congratulations, ${name}!</p>
              <p style="margin:0 0 16px;font-size:14px;color:#1a1a1a;line-height:1.6;">
                You have successfully completed the <strong>BCPS Department Web Content Manager Certification</strong>${profile?.department ? ` for <strong>${profile.department}</strong>` : ''}.
              </p>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr>
                  <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;width:130px;">Issued</td>
                  <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${issuedDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Expires</td>
                  <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${expiresDate}</td>
                </tr>
                <tr>
                  <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Course</td>
                  <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">Department WCM - v1</td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:13px;color:#555;line-height:1.6;">
                Next: get into Finalsite to actually update your department page. Your certificate page below has step-by-step login instructions for both recertifying and first-time WCMs.
              </p>
              <a href="https://bcpsmarcomm.com/certification/departments/complete"
                 style="display:inline-block;padding:10px 20px;background:#1672A7;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;">
                View your certificate
              </a>
            </div>
          `,
        })
        if (!result.ok) console.error('Cert completion email failed:', result.error)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Complete API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
