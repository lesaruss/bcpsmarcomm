import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createAnonClientWithToken } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createServiceClient(URL, SERVICE)

// Member-facing side of the access-request flow (per Sean, 2026-07-29).
// The token in the URL is only half the proof - whoever holds the link
// must also sign in as the actual target member before they can act on
// it, so a forwarded or intercepted email can't grant access to someone
// else's account. Every state change is timestamped on the row itself,
// which doubles as the audit trail (requested_at/responded_at/
// approved_at/closed_at/closed_by).
async function requireMatchingMember(req: NextRequest, token: string) {
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!auth) return { ok: false as const, status: 401 }
  const asUser = createAnonClientWithToken(URL, ANON, auth)
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }

  const { data: grant } = await svc.from('support_access_grants')
    .select('*').eq('request_token', token).maybeSingle()
  if (!grant) return { ok: false as const, status: 404 }
  if (grant.target_user_id !== user.id) return { ok: false as const, status: 403 }

  return { ok: true as const, grant, userEmail: user.email || '' }
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const result = await requireMatchingMember(req, params.token)
  if (!result.ok) return NextResponse.json({ error: 'Not found or not your request.' }, { status: result.status })
  const { grant } = result
  return NextResponse.json({
    status: grant.status,
    reason: grant.reason,
    requested_by_email: grant.requested_by_email,
    requested_at: grant.requested_at,
    approved_at: grant.approved_at,
    closed_at: grant.closed_at,
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const result = await requireMatchingMember(req, params.token)
  if (!result.ok) return NextResponse.json({ error: 'Not found or not your request.' }, { status: result.status })
  const { grant } = result

  const body = await req.json().catch(() => ({}))
  const action = body?.action as 'approve' | 'deny' | 'revoke'
  const now = new Date().toISOString()

  if (action === 'approve' && grant.status === 'requested') {
    await svc.from('support_access_grants').update({
      status: 'approved', responded_at: now, approved_at: now,
    }).eq('id', grant.id)
    if (grant.requested_by_email) {
      await sendEmail({
        to: grant.requested_by_email,
        subject: 'Access approved on bcpsmarcomm.com',
        html: `<p>Your access request was approved. You can now view their account (read-only) from the dashboard's access requests panel.</p>`,
      })
    }
    return NextResponse.json({ ok: true, status: 'approved' })
  }

  if (action === 'deny' && grant.status === 'requested') {
    await svc.from('support_access_grants').update({
      status: 'denied', responded_at: now, closed_at: now, closed_by: 'member',
    }).eq('id', grant.id)
    if (grant.requested_by_email) {
      await sendEmail({
        to: grant.requested_by_email,
        subject: 'Access request declined on bcpsmarcomm.com',
        html: `<p>They declined the access request.</p>`,
      })
    }
    return NextResponse.json({ ok: true, status: 'denied' })
  }

  if (action === 'revoke' && grant.status === 'approved') {
    await svc.from('support_access_grants').update({
      status: 'closed', closed_at: now, closed_by: 'member',
    }).eq('id', grant.id)
    if (grant.requested_by_email) {
      await sendEmail({
        to: grant.requested_by_email,
        subject: 'Access revoked on bcpsmarcomm.com',
        html: `<p>They revoked your access. The read-only view is no longer available.</p>`,
      })
    }
    return NextResponse.json({ ok: true, status: 'closed' })
  }

  return NextResponse.json({ error: 'Invalid action for current status.' }, { status: 400 })
}
