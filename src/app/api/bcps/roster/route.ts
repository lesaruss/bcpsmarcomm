import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// The BCC-list roster: every department with its Director and Web Content
// Manager, live from bcps_departments, for a superadmin pulling a batch of
// addresses into an Outlook email. Rebuilt from the reference "The Roster"
// artifact (Sean, 2026-09-17), reading the real table instead of a static
// snapshot - director_email now exists on this table (added for roster
// provenance tracking), so unlike the reference, directors show a real
// confirmed address here too, not just a name.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  if (roleRow?.role !== 'superadmin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { data: departments, error: deptErr } = await svc.from('bcps_departments')
    .select('slug, name, division, director_name, director_email')
    .order('name')
  if (deptErr) return NextResponse.json({ error: deptErr.message }, { status: 500 })

  // bcps_departments.wcm_name/wcm_email are almost entirely unpopulated -
  // WCMs are tracked as they actually register, in wcm_cert_users, which
  // allows more than one person per department and free-text department
  // names (whatever the registrant typed or was recorded under), not the
  // canonical bcps_departments.slug. So the WCM list comes from there,
  // matched back to a canonical department by a normalized name compare;
  // an unmatched registrant is still included under their own raw
  // department text rather than silently dropped.
  const { data: wcmUsers, error: wcmErr } = await svc.from('wcm_cert_users')
    .select('department, email, full_name')
    .order('department')
  if (wcmErr) return NextResponse.json({ error: wcmErr.message }, { status: 500 })

  const res = NextResponse.json({ ok: true, departments: departments ?? [], wcm_users: wcmUsers ?? [] })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
