import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// Feature-scoped Admin/Manager permissions for the WCM Banner Submission
// widget. Deliberately a standalone table (bcps_banner_admins), not layered
// onto the global acl_member_roles system - per Sean, 2026-09-02: "I just
// want it set up like that outside of the box... we don't have to have that
// be a whole other thing."
//
// Admin: full control of this feature - approve/reject submissions, AND
//   manage who else is an Admin or Manager.
// Manager: does the day-to-day review work (approve/reject submissions) but
//   cannot add/remove Admins or Managers.
//
// Vanessa Deslandes was seeded as the first Admin directly via migration
// (2026-09-02). This route is how she (and any Admin after her) adds more.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

async function verifyCaller(token: string) {
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

async function requireBannerAdmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return { ok: false as const, status: 401 }
  const { data: row } = await svc.from('bcps_banner_admins')
    .select('role').eq('user_id', user.id).maybeSingle()
  if (!row || row.role !== 'admin') return { ok: false as const, status: 403 }
  return { ok: true as const, user }
}

// GET: list current Admins/Managers for this feature. Also tells the caller
// their own role, so the dashboard widget can show/hide the review queue and
// the "manage admins" panel without a second round trip.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: myRow } = await svc.from('bcps_banner_admins')
    .select('role').eq('user_id', user.id).maybeSingle()

  if (!myRow) return NextResponse.json({ my_role: null, admins: [] })

  const { data: admins, error } = await svc.from('bcps_banner_admins')
    .select('id, user_id, email, role, added_by_email, created_at')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ my_role: myRow.role, admins: admins ?? [] })
}

// POST: add or remove an Admin/Manager. Admin-only.
// body: { action: 'add', email: string, role: 'admin' | 'manager' }
//     | { action: 'remove', user_id: string }
export async function POST(req: NextRequest) {
  const auth = await requireBannerAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { action } = body as { action?: 'add' | 'remove' }

  if (action === 'add') {
    const email = (body?.email || '').trim().toLowerCase()
    const role = body?.role === 'manager' ? 'manager' : body?.role === 'admin' ? 'admin' : null
    if (!email || !role) return NextResponse.json({ error: 'email and role are required' }, { status: 400 })

    // Look up the target user by email in auth.users via a service-role
    // admin call - they must already have a bcpsmarcomm.com account
    // (single BCPS Marcomm login gates every feature, this one included).
    const { data: usersPage, error: lookupErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
    const target = usersPage.users.find(u => (u.email || '').toLowerCase() === email)
    if (!target) {
      return NextResponse.json({ error: 'No bcpsmarcomm.com account found for that email. They need to sign in at least once first.' }, { status: 404 })
    }

    const { error: upsertErr } = await svc.from('bcps_banner_admins').upsert({
      user_id: target.id,
      email: target.email,
      role,
      added_by: auth.user.id,
      added_by_email: auth.user.email,
    }, { onConflict: 'user_id' })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  if (action === 'remove') {
    const user_id = body?.user_id
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    if (user_id === auth.user.id) return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 })

    const { error } = await svc.from('bcps_banner_admins').delete().eq('user_id', user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
