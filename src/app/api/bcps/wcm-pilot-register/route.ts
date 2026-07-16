import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const WCM_GROUP_SLUG = 'wcm'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Enrolls a just-registered WCM Pilot participant into the real permissions
// system: acl_member_roles (brand membership) + acl_group_members (the 'wcm'
// group). This is what makes registering here different from the old
// certification-only signup, which only ever created a course profile row
// and never touched the permissions system.
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Missing session.' }, { status: 401 })

  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })

  try {
    const { data: group } = await svc
      .from('acl_groups')
      .select('id')
      .eq('brand', BRAND)
      .eq('slug', WCM_GROUP_SLUG)
      .maybeSingle()

    const { error: roleError } = await svc.from('acl_member_roles').upsert(
      { user_id: user.id, brand: BRAND, role: 'user' },
      { onConflict: 'user_id,brand' }
    )
    if (roleError) throw roleError

    if (group?.id) {
      const { error: groupError } = await svc.from('acl_group_members').upsert(
        { group_id: group.id, user_id: user.id },
        { onConflict: 'group_id,user_id' }
      )
      if (groupError) throw groupError
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Enrollment failed.' }, { status: 500 })
  }
}
