import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// Who may use "View as" besides SuperAdmin (Sean, Hot Lab 2026-09-29). A
// grantee previews only their own tier and below - that limit is enforced in
// /api/bcps/my-access, this route only manages the list. SuperAdmin only.

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)
const BRAND = 'bcps'

async function requireSuperadmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  return roleRow?.role === 'superadmin' ? user : null
}

export async function GET(req: NextRequest) {
  if (!(await requireSuperadmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from('bcps_view_as_grants')
    .select('user_id, email, granted_by_email, created_at').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ grants: data ?? [] })
}

// body: { action: 'add', email } | { action: 'remove', user_id }
export async function POST(req: NextRequest) {
  const me = await requireSuperadmin(req)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const { action, email, user_id } = body as { action?: string; email?: string; user_id?: string }

  if (action === 'remove') {
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    const { error } = await svc.from('bcps_view_as_grants').delete().eq('user_id', user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'add') {
    const target = email?.trim().toLowerCase()
    if (!target) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    // Same lookup pattern as /api/banner/admins: the person must already
    // have a bcpsmarcomm.com account.
    let found: { id: string; email?: string } | null = null
    for (let page = 1; page <= 20 && !found; page++) {
      const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      found = data.users.find(u => (u.email || '').toLowerCase() === target) ?? null
      if (data.users.length < 200) break
    }
    if (!found) return NextResponse.json({ error: 'No bcpsmarcomm.com account found for that email yet.' }, { status: 404 })
    const { error } = await svc.from('bcps_view_as_grants').upsert({
      user_id: found.id, email: found.email ?? target, granted_by_email: me.email,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
