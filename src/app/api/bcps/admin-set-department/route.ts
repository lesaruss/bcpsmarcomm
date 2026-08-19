import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin-only endpoint: reassign a BCPS team member's department from the
// Members directory (both Tiles and Table views). Same requireBcpsAdmin
// pattern as admin-decision - server-enforced, not just hidden in the UI,
// since this changes another user's role-scoped data.
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
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
  return { ok: true, email: user.email || '' }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBcpsAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: auth.status })

    const { user_id, department_slug } = await req.json() as {
      user_id: string
      department_slug: string | null
    }
    if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

    // department_slug may be null/empty to unassign the member from any department.
    if (department_slug) {
      const { data: dept } = await supabase
        .from('bcps_departments')
        .select('slug')
        .eq('slug', department_slug)
        .maybeSingle()
      if (!dept) return NextResponse.json({ error: 'Unknown department' }, { status: 400 })
    }

    // department_confirmed is reserved for the director's own registration
    // (see wcm-pilot-register) - it's the one signal that the director
    // themselves completed the process. Any manual admin reassignment here
    // is, by definition, not that, so it always resets the flag to false
    // rather than carrying forward whatever it was.
    const { error } = await supabase
      .from('acl_member_roles')
      .update({
        department_slug: department_slug || null,
        department_confirmed: false,
        department_confirmed_at: null,
      })
      .eq('user_id', user_id)
      .eq('brand', 'bcps')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
