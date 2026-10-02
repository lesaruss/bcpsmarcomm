import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'department-program-directory'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Same editor check as the II&DL Services Directory (src/app/api/bcps/
// iidl-services/route.ts), pointed at the department-program-directory page
// object: superadmin, brand-level admin, or anyone granted 'edit'/'manage'
// on that object directly or through a group.
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

const TOPICS = new Set(['enroll', 'hr', 'ops', 'support', 'acad', 'family', 'safety', 'activities', 'money', 'tech', 'gov'])
const TEXT_FIELDS = ['name', 'url', 'context', 'description', 'popular_label', 'review_note'] as const
const INT_FIELDS = ['demand_rank', 'popular_rank', 'sort_order'] as const

function list(v: unknown) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const s = String(item).replace(/\s+/g, ' ').trim().slice(0, 80)
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s) }
  }
  return out.slice(0, 40)
}

// Whitelists what an editor may set and normalizes it. Throws a message the
// editor shows as-is when a value is invalid.
function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of TEXT_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    out[f] = typeof v === 'string' && v.trim() ? v.trim() : null
  }
  for (const f of INT_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    const n = v === '' || v == null ? null : Number(v)
    if (n !== null && !Number.isInteger(n)) throw new Error(`${f.replace('_', ' ')} must be a whole number.`)
    out[f] = n
  }
  if ('kind' in body) {
    if (body.kind !== 'department' && body.kind !== 'program') throw new Error('Type must be department or program.')
    out.kind = body.kind
  }
  if ('topic' in body) {
    if (!TOPICS.has(String(body.topic))) throw new Error('Pick a topic.')
    out.topic = body.topic
  }
  if ('audiences' in body) out.audiences = String(body.audiences ?? '').toUpperCase().replace(/[^FSEC]/g, '')
  if ('tags' in body) out.tags = list(body.tags)
  if ('includes' in body) out.includes = list(body.includes)
  if ('active' in body) out.active = Boolean(body.active)
  if ('name' in out && !out.name) throw new Error('Name cannot be blank.')
  if ('url' in out && !/^https:\/\/\S+$/.test(String(out.url ?? ''))) throw new Error('Page link must start with https://')
  return out
}

// GET /api/bcps/directory - every entry, including inactive ones and the
// internal review_note. GET ?view=insights&days=30 - search insights.
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (req.nextUrl.searchParams.get('view') === 'insights') {
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30))
    const { data, error } = await svc.rpc('bcps_directory_insights', { days })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, insights: data })
  }

  const { data, error } = await svc.from('bcps_directory_entries').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entries: data ?? [] })
}

// POST /api/bcps/directory - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'entry_create': {
        const fields = pick(body)
        if (!fields.name || !fields.url || !fields.kind || !fields.topic) {
          return NextResponse.json({ error: 'Name, page link, type and topic are required.' }, { status: 400 })
        }
        const { data, error } = await svc.from('bcps_directory_entries').insert(fields).select().single()
        if (error) throw error
        await audit(user.id, 'directory_entry_create', { name: fields.name })
        return NextResponse.json({ ok: true, entry: data }, { status: 201 })
      }
      case 'entry_update': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const updates = pick(body)
        const { data, error } = await svc.from('bcps_directory_entries')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'directory_entry_update', { id, updates })
        return NextResponse.json({ ok: true, entry: data })
      }
      case 'entry_add_tag': {
        // One-click fix from the insights view: a search that found nothing
        // becomes a tag on the page it should have found.
        const { id } = body
        const [tag] = list([body.tag])
        if (!id || !tag) return NextResponse.json({ error: 'Entry and tag required.' }, { status: 400 })
        const { data: row, error: readErr } = await svc.from('bcps_directory_entries').select('tags').eq('id', id).single()
        if (readErr) throw readErr
        const tags = list([...(row?.tags ?? []), tag])
        const { data, error } = await svc.from('bcps_directory_entries')
          .update({ tags, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'directory_entry_add_tag', { id, tag })
        return NextResponse.json({ ok: true, entry: data })
      }
      case 'entry_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_directory_entries').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'directory_entry_delete', { id })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 400 })
  }
}
