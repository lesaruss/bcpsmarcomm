import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin-only endpoint: set a temporary password for a BCPS team member and
// force them to change it on next sign-in (Sean, 2026-09-09, BCPS Marcomm
// multi-user reset incident - district-side mail filtering was very likely
// swallowing/quarantining reset emails and burning reset links before
// members could use them, see error_registry
// BCPS-RESET-EMAIL-DISTRICT-FILTER-SUSPECTED). This is a second fail-safe
// alongside /api/bcps/admin-reset-password's live link: instead of a link
// that depends on the member's own device/browser and expires shortly, this
// hands the admin an actual temporary password they can read out loud, text,
// or write down for the member, who can sign in with it immediately from
// any device. No email involved at any point.
//
// must_change_password enforcement already exists end-to-end in this repo
// (it was originally built for this exact purpose - see the comment in
// src/app/(bcps)/set-password/page.tsx): /login redirects a signed-in user
// straight to /set-password whenever user_metadata.must_change_password is
// true, and /set-password clears the flag itself
// (supabase.auth.updateUser({ password, data: { must_change_password:
// false } })) once they choose their own password. This endpoint only had
// to supply the missing piece: an admin-triggered way to actually set that
// flag and a real temporary password together.
//
// Same requireBcpsAdmin gate pattern as admin-reset-password /
// admin-set-department - server enforced, not just hidden in the UI, since
// this sets another user's password.
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

// Readable, unambiguous temp password: avoids 0/O/1/l/I and vowel-heavy
// runs that could spell something awkward, since this is often read aloud
// or typed by hand off a text message. 12 chars from a wide charset is
// comfortably above any reasonable brute-force floor for a one-time,
// forced-change credential.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
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
    const tempPassword = generateTempPassword()

    // Merge, don't replace: user_metadata carries other fields (name, etc.)
    // that must survive this call.
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(user_id, {
      password: tempPassword,
      user_metadata: {
        ...(target.user.user_metadata || {}),
        must_change_password: true,
      },
    })

    if (updateError || !updated?.user) {
      return NextResponse.json({ error: updateError?.message || 'Could not set a temporary password' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      email,
      temp_password: tempPassword,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
