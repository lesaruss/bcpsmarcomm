import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// List of support-access grants the *current admin* has requested, for the
// Dashboard "Access Requests" panel. Only shows grants still open (requested
// or approved) - closed/denied ones drop off.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 401 })

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: grants, error: grantsErr } = await svc.from('support_access_grants')
    .select('id, target_user_id, status, reason, requested_at, approved_at')
    .eq('requested_by', user.id)
    .in('status', ['requested', 'approved'])
    .order('requested_at', { ascending: false })

  if (grantsErr) return NextResponse.json({ error: grantsErr.message }, { status: 500 })

  const targetIds = Array.from(new Set((grants ?? []).map(g => g.target_user_id)))
  const { data: profiles, error: profilesErr } = targetIds.length
    ? await svc.from('wcm_cert_users').select('user_id, full_name, email').in('user_id', targetIds)
    : { data: [], error: null }

  if (profilesErr) return NextResponse.json({ error: profilesErr.message }, { status: 500 })

  const byId = new Map((profiles ?? []).map(p => [p.user_id, p]))
  const requests = (grants ?? []).map(g => ({
    ...g,
    target_name: byId.get(g.target_user_id)?.full_name || byId.get(g.target_user_id)?.email || 'Member',
  }))

  return NextResponse.json({ requests })
}
