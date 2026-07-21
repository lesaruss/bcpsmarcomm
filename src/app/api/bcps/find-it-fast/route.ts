import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'find-it-fast'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the Find It Fast
// module: superadmin, brand-level admin, or anyone granted 'edit'/'manage' on
// the find-it-fast page object directly or through a group (same model as
// the Permissions Console - see src/app/api/bcps/permissions/route.ts).
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

// GET /api/bcps/find-it-fast - categories + links for the admin editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [cats, links] = await Promise.all([
    svc.from('bcps_fif_categories').select('*').order('sort_order'),
    svc.from('bcps_fif_links').select('*').order('sort_order'),
  ])
  if (cats.error) return NextResponse.json({ error: cats.error.message }, { status: 500 })
  if (links.error) return NextResponse.json({ error: links.error.message }, { status: 500 })

  return NextResponse.json({ ok: true, categories: cats.data ?? [], links: links.data ?? [] })
}

// POST /api/bcps/find-it-fast - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'category_create': {
        const { slug, label, icon_key, sort_order } = body
        if (!slug || !label) return NextResponse.json({ error: 'slug and label required.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_fif_categories')
          .insert({ slug, label, icon_key: icon_key || 'none', sort_order: sort_order ?? 0 })
          .select().single()
        if (error) throw error
        await audit(user.id, 'fif_category_create', { slug, label })
        return NextResponse.json({ ok: true, category: data }, { status: 201 })
      }
      case 'category_update': {
        const { id, ...updates } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        delete updates.action
        const { data, error } = await svc.from('bcps_fif_categories')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'fif_category_update', { id, updates })
        return NextResponse.json({ ok: true, category: data })
      }
      case 'category_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_fif_categories').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'fif_category_delete', { id })
        return NextResponse.json({ ok: true })
      }
      case 'link_create': {
        const { category_slug, title, url, blurb, sort_order } = body
        if (!category_slug || !title || !url) return NextResponse.json({ error: 'category_slug, title, url required.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_fif_links')
          .insert({ category_slug, title, url, blurb: blurb ?? null, sort_order: sort_order ?? 0 })
          .select().single()
        if (error) throw error
        await audit(user.id, 'fif_link_create', { title, category_slug })
        return NextResponse.json({ ok: true, link: data }, { status: 201 })
      }
      case 'link_update': {
        const { id, ...updates } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        delete updates.action
        const { data, error } = await svc.from('bcps_fif_links')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'fif_link_update', { id, updates })
        return NextResponse.json({ ok: true, link: data })
      }
      case 'link_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_fif_links').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'fif_link_delete', { id })
        return NextResponse.json({ ok: true })
      }
      case 'reorder': {
        // body.items: [{ table: 'category'|'link', id, sort_order }]
        const items = Array.isArray(body.items) ? body.items : []
        for (const it of items) {
          const table = it.table === 'category' ? 'bcps_fif_categories' : 'bcps_fif_links'
          const { error } = await svc.from(table).update({ sort_order: it.sort_order, updated_at: new Date().toISOString() }).eq('id', it.id)
          if (error) throw error
        }
        await audit(user.id, 'fif_reorder', { count: items.length })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
