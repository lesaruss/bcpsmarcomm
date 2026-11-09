import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'software-inventory'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the District
// Software Inventory. Same check as the II&DL Services Directory
// (src/app/api/bcps/iidl-services/route.ts), pointed at the
// software-inventory page object: superadmin,
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
// so a client can never write id/created_at or an unknown column. The last
// six are internal CTC tracking fields the public embed cannot read.
const FIELDS = ['program_name', 'vendor', 'subject', 'department', 'grade_band', 'intended_use', 'description',
  'bid_id', 'vendor_terms_label', 'vendor_terms_url', 'board_agreement_url', 'agreement_vendor',
  'contract_file_name', 'ctc_updated', 'ctc_rating', 'software_type', 'usage_type', 'sort_order'] as const

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    // Blank text clears the field so the embed's "only show what is real" checks keep working.
    out[f] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v
  }
  return out
}

// GET /api/bcps/software-inventory - every row, including internal fields, for the editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from('bcps_software_inventory').select('*').order('program_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [] })
}

// POST /api/bcps/software-inventory - { action: create | update | delete, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  try {
    switch (body.action as string) {
      case 'create': {
        const fields = pick(body)
        if (!fields.program_name) return NextResponse.json({ error: 'Program name required.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_software_inventory').insert(fields).select().single()
        if (error) throw error
        await audit(user.id, 'software_inventory_create', { program_name: fields.program_name })
        return NextResponse.json({ ok: true, item: data }, { status: 201 })
      }
      case 'update': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const updates = pick(body)
        if ('program_name' in updates && !updates.program_name) return NextResponse.json({ error: 'Program name cannot be blank.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_software_inventory')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'software_inventory_update', { id, updates })
        return NextResponse.json({ ok: true, item: data })
      }
      case 'delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_software_inventory').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'software_inventory_delete', { id })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
