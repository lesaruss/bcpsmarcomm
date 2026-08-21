import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'charter-school-directory'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the Charter
// School Directory: superadmin, brand-level admin, or anyone granted
// 'edit'/'manage' on the charter-school-directory page object directly or
// through a group (same model as Find It Fast - see
// src/app/api/bcps/find-it-fast/route.ts and the Permissions Console at
// src/app/api/bcps/permissions/route.ts).
async function requireEditor(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null

  if (SUPERADMIN_EMAILS.has(user.email ?? '')) return user

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  const role = roleRow?.role || 'user'
  if (role === 'superadmin' || role === 'admin') return user

  const { data: obj } = await svc.from('acl_objects')
    .select('id').eq('brand', BRAND).eq('kind', 'page').eq('slug', PAGE_SLUG).maybeSingle()
  if (!obj) return null

  const { data: directGrant } = await svc.from('acl_grants')
    .select('role').eq('object_id', obj.id).eq('subject_type', 'user').eq('subject_id', user.id).maybeSingle()
  if (directGrant && ['edit', 'manage'].includes(directGrant.role)) return user

  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  if (gids.length) {
    const { data: groupGrants } = await svc.from('acl_grants')
      .select('role, subject_id').eq('object_id', obj.id).eq('subject_type', 'group')
    if ((groupGrants ?? []).some(g => gids.includes(g.subject_id) && ['edit', 'manage'].includes(g.role))) return user
  }

  return null
}

async function audit(actor: string, action: string, detail: unknown) {
  await svc.from('acl_audit').insert({ brand: BRAND, actor_id: actor, action, object_id: null, detail })
}

// GET /api/bcps/charter-schools - full roster for the admin editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await svc.from('bcps_charter_schools').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, schools: data ?? [] })
}

// POST /api/bcps/charter-schools - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'school_create': {
        const { name, grades, city, address, phone, principal, website, sort_order } = body
        if (!name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_charter_schools')
          .insert({
            name, grades: grades ?? null, city: city ?? null, address: address ?? null,
            phone: phone ?? null, principal: principal ?? null, website: website ?? null,
            sort_order: sort_order ?? 0,
          })
          .select().single()
        if (error) throw error
        await audit(user.id, 'charter_school_create', { name })
        return NextResponse.json({ ok: true, school: data }, { status: 201 })
      }
      case 'school_update': {
        const { id, ...updates } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        delete updates.action
        const { data, error } = await svc.from('bcps_charter_schools')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'charter_school_update', { id, updates })
        return NextResponse.json({ ok: true, school: data })
      }
      case 'school_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_charter_schools').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'charter_school_delete', { id })
        return NextResponse.json({ ok: true })
      }
      case 'reorder': {
        // body.items: [{ id, sort_order }]
        const items = Array.isArray(body.items) ? body.items : []
        for (const it of items) {
          const { error } = await svc.from('bcps_charter_schools')
            .update({ sort_order: it.sort_order, updated_at: new Date().toISOString() }).eq('id', it.id)
          if (error) throw error
        }
        await audit(user.id, 'charter_school_reorder', { count: items.length })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
