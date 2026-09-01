import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin-only endpoint: force a password reset for a BCPS team member from
// the Members directory profile view (Sean, 2026-09-01, wanted live on a
// call with Alan). Sends the exact Supabase Auth recovery email a member
// gets from their own "Forgot password?" link on /login
// (supabase.auth.resetPasswordForEmail) - just triggered by an admin on the
// member's behalf instead of the member typing their own email. Lands on
// the already-live /set-password page, same as the self-service flow.
//
// Deliberately NOT admin.generateLink(type: recovery) - see error_registry
// ADMIN-MAGICLINK-PKCE-MISMATCH: generateLink returns an implicit-flow
// #access_token link that this app's PKCE-only /auth/callback route cannot
// consume. resetPasswordForEmail is the same client-initiated recovery
// call the login page already makes, which is why /set-password already
// knows how to handle it (PASSWORD_RECOVERY auth event).
//
// Same requireBcpsAdmin gate pattern as admin-set-department - server
// enforced, not just hidden in the UI, since this touches another user's
// account.
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

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(target.user.email, {
      redirectTo: `${req.nextUrl.origin}/set-password`,
    })
    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 })

    return NextResponse.json({ success: true, email: target.user.email })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
