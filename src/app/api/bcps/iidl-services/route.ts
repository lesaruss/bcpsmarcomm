import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'iidl-services-directory'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the II&DL
// Services Directory. This is the same check that guards the Charter School
// Directory (requireEditor in src/app/api/bcps/charter-schools/route.ts),
// pointed at the iidl-services-directory page object: superadmin,
// brand-level admin, or anyone granted 'edit'/'manage' on that object
// directly or through a group. The Widgets hub (src/app/api/bcps/widgets/
// route.ts) computes can_edit from the same grants, so the Edit button and
// this route always agree.
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

// Fields an editor may set. Anything else in the request body is ignored,
// so a client can never write id/created_at or an unknown column.
const SERVICE_FIELDS = ['name', 'unit_slug', 'description', 'contact_name', 'contact_title', 'contact_email',
  'contact_phone', 'booking_url', 'booking_note', 'review_note', 'sort_order'] as const
const UNIT_FIELDS = ['name', 'summary', 'page_url'] as const

function pick(body: Record<string, unknown>, fields: readonly string[]) {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (!(f in body)) continue
    const v = body[f]
    // Blank text clears the field rather than storing an empty string, so
    // the embed's "only show what is real" checks keep working.
    out[f] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v
  }
  return out
}

// GET /api/bcps/iidl-services - services (including review_note) and units
// for the admin editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [svcRes, unitRes] = await Promise.all([
    svc.from('bcps_iidl_services').select('*').order('sort_order'),
    svc.from('bcps_iidl_units').select('*').order('sort_order'),
  ])
  const error = svcRes.error || unitRes.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, services: svcRes.data ?? [], units: unitRes.data ?? [] })
}

// POST /api/bcps/iidl-services - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'service_create': {
        const fields = pick(body, SERVICE_FIELDS)
        if (!fields.name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_iidl_services').insert(fields).select().single()
        if (error) throw error
        await audit(user.id, 'iidl_service_create', { name: fields.name })
        return NextResponse.json({ ok: true, service: data }, { status: 201 })
      }
      case 'service_update': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const updates = pick(body, SERVICE_FIELDS)
        if ('name' in updates && !updates.name) return NextResponse.json({ error: 'name cannot be blank.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_iidl_services')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'iidl_service_update', { id, updates })
        return NextResponse.json({ ok: true, service: data })
      }
      case 'service_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_iidl_services').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'iidl_service_delete', { id })
        return NextResponse.json({ ok: true })
      }
      case 'unit_update': {
        const { slug } = body
        if (!slug) return NextResponse.json({ error: 'slug required.' }, { status: 400 })
        const updates = pick(body, UNIT_FIELDS)
        if ('name' in updates && !updates.name) return NextResponse.json({ error: 'name cannot be blank.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_iidl_units')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('slug', slug).select().single()
        if (error) throw error
        await audit(user.id, 'iidl_unit_update', { slug, updates })
        return NextResponse.json({ ok: true, unit: data })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
