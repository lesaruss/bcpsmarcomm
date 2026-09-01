import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin-only endpoint: force a password reset for a BCPS team member from
// the Members directory profile view (Sean, 2026-09-01, live on a call with
// Alan). Two things happen on every call, and neither depends on the other:
//
// 1. A real, working reset link is minted with supabase.auth.admin.generateLink
//    (type: recovery) and handed straight back in the response. This is the
//    fail-safe Sean asked for: if the admin is in the room with a member who
//    can't sign in, copy this link and send it to them directly (text,
//    Slack, read it out loud) - no email involved, and the member never has
//    to be given a temporary password. Opening it lands them on the
//    already-live /set-password page to choose their own new password.
//
//    This is safe to do with generateLink here specifically because
//    /set-password consumes the recovery tokens itself client-side
//    (onAuthStateChange listening for the PASSWORD_RECOVERY event), not via
//    the separate PKCE-only /auth/callback route. See error_registry
//    ADMIN-MAGICLINK-PKCE-MISMATCH: that incident was about a DIFFERENT
//    route (hq.lesaruss.ai /auth/callback) that only accepts a ?code= query
//    param and chokes on the implicit-style link generateLink returns. That
//    failure mode does not apply here because /set-password was never built
//    to expect a ?code= param in the first place - see /login's own
//    "Forgot password?" flow (resetPasswordForEmail -> redirectTo
//    /set-password), which is the same link shape and already works.
//
// 2. The same branded recovery email a member gets from their own "Forgot
//    password?" link is also sent (resetPasswordForEmail), so the normal
//    case still "just works" with no extra click. This can legitimately
//    fail on Supabase's per-email send cooldown even when the link above is
//    completely valid, so its outcome is reported separately (email_sent /
//    email_error) instead of blocking the fail-safe link on it.
//
// Same requireBcpsAdmin gate pattern as admin-set-department - server
// enforced, not just hidden in the UI, since this touches another user's
// account and now also hands back a live sign-in-capable link.
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const { createClient: createAnonClient } = await import('@supabase/supabase-js')
  const asUser = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await supabase.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403 }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBcpsAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: auth.status })

    const { user_id } = await req.json() as { user_id: string }
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    const { data: target, error: lookupError } = await supabase.auth.admin.getUserById(user_id)
    if (lookupError || !target?.user?.email) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }
    const email = target.user.email
    const redirectTo = `${req.nextUrl.origin}/set-password`

    // Order matters here and is not arbitrary. GoTrue enforces its
    // per-user "recovery" send cooldown (~60s) by stamping recovery_sent_at
    // on ANY recovery-type call, admin.generateLink included - not just the
    // client-initiated resetPasswordForEmail. Calling generateLink first (as
    // this route originally did) stamps that cooldown, so the very next
    // resetPasswordForEmail call always fails with "you can only request
    // this after N seconds" - live-verified 2026-09-01: with generateLink
    // first, email_sent was false on every single call. admin.generateLink
    // itself is NOT subject to that cooldown (it's a service-role admin
    // call), so calling resetPasswordForEmail FIRST, then generateLink,
    // lets both succeed on every call.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })
    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json({ error: linkError?.message || 'Could not generate a reset link' }, { status: 500 })
    }
    const resetLink = linkData.properties.action_link

    return NextResponse.json({
      success: true,
      email,
      reset_link: resetLink,
      email_sent: !resetError,
      email_error: resetError?.message ?? null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
