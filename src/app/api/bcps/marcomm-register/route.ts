import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const GROUP_SLUG = 'marcomm'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// MarComm Meeting onboarding (Sean, 2026-10-16). Called by /marcomm-registration
// right after a new account is created, and by an already signed-in person who
// needs MarComm access added to the account they have. Gives the account BCPS
// membership and, when its email is on the MarComm Meeting roster
// (bcps_marcomm_team), the 'marcomm' group, which opens MarComm Assignments.
// The roster is the gate: an email that is not on it gets an account but no
// MarComm access, and is told who to ask.
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Missing session.' }, { status: 401 })

  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })

  // Same server-side district check as wcm-pilot-register: account creation
  // runs in the browser, so enrollment is where the domain rule is enforced.
  const email = (user.email || '').trim().toLowerCase()
  if (!email.endsWith('@browardschools.com')) {
    return NextResponse.json(
      { error: 'BCPS access is restricted to @browardschools.com email addresses.' },
      { status: 403 }
    )
  }

  try {
    // Brand membership. ignoreDuplicates so an existing row (an admin, or a
    // WCM with a department) is never overwritten or downgraded.
    const { error: roleError } = await svc.from('acl_member_roles').upsert(
      { user_id: user.id, brand: BRAND, role: 'user' },
      { onConflict: 'user_id,brand', ignoreDuplicates: true }
    )
    if (roleError) throw roleError

    const { data: rosterRow } = await svc
      .from('bcps_marcomm_team')
      .select('name')
      .eq('kind', 'person')
      .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
      .maybeSingle()
    if (!rosterRow) return NextResponse.json({ ok: true, on_roster: false })

    const { data: group } = await svc
      .from('acl_groups')
      .select('id')
      .eq('brand', BRAND)
      .eq('slug', GROUP_SLUG)
      .maybeSingle()
    if (!group?.id) throw new Error('MarComm Meeting group is missing.')

    const { error: groupError } = await svc.from('acl_group_members').upsert(
      { group_id: group.id, user_id: user.id },
      { onConflict: 'group_id,user_id', ignoreDuplicates: true }
    )
    if (groupError) throw groupError

    return NextResponse.json({ ok: true, on_roster: true, name: rosterRow.name })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Enrollment failed.' }, { status: 500 })
  }
}
