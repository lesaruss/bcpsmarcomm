import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isBcpsAdmin } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AUTH, added 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// Unauthenticated before this: anyone could POST a user_id and rewrite that
// learner's name and department in wcm_cert_users. Self-service by design, so
// a signed-in user may edit only their own profile; a BCPS admin may edit
// anyone's, which is what support needs.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { user_id, full_name, department } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    if (user_id !== auth.user.userId && !(await isBcpsAdmin(auth.user.userId))) {
      return NextResponse.json({ error: 'You can only edit your own profile.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('wcm_cert_users')
      .update({ full_name: full_name || null, department: department || null })
      .eq('user_id', user_id)

    if (error) {
      console.error('Profile update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Profile API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
