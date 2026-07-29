import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: userErr } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden', userErr: userErr?.message }, { status: 401 })
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return NextResponse.json({ error: 'Forbidden', debugUserId: user.id, role }, { status: 403 })

  const { data: grants, error: grantsErr } = await svc.from('support_access_grants')
    .select('id, target_user_id, status, reason, requested_at, approved_at, requested_by')
    .eq('requested_by', user.id)
    .in('status', ['requested', 'approved'])
    .order('requested_at', { ascending: false })

  const { data: allGrants, error: allErr } = await svc.from('support_access_grants').select('id, requested_by, status')

  return NextResponse.json({
    debugUserId: user.id,
    debugUrl: URL,
    role,
    grantsErr: grantsErr?.message ?? null,
    grants,
    allErr: allErr?.message ?? null,
    allGrants,
  })
}
