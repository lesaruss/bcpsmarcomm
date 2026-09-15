import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AUTH, added 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// Unauthenticated before this: anyone could upsert a wcm_cert_users row for an
// arbitrary user_id and email. The row it creates is harmless on its own
// (is_admin false, ignoreDuplicates), but it is still a write on someone
// else's behalf. The caller now provisions only their own row - identity comes
// from the session, and the client-supplied user_id must match it.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { user_id, email } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    if (user_id !== auth.user.userId) {
      return NextResponse.json({ error: 'You can only create your own profile.' }, { status: 403 })
    }
    await supabase.from('wcm_cert_users').upsert(
      { user_id, email: email ?? null, is_admin: false },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Ensure profile error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
