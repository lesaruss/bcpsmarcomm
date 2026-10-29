import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'magnet-program-explorer'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Same editor check as the Charter School Directory (src/app/api/bcps/
// charter-schools/route.ts): superadmin, brand-level admin, or anyone granted
// 'edit'/'manage' on the magnet-program-explorer page object directly or
// through a group.
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

// Editable columns per table. Anything else in the request body is ignored,
// so keys (slug, loc_nbr, program_slug + school_loc) never change on update.
const FIELDS = {
  theme: ['name', 'kind', 'description', 'sort_order'],
  school: ['name', 'site_url', 'logo_url', 'address', 'city', 'zip', 'grades', 'levels', 'region', 'lat', 'lng', 'sort_order'],
  program: ['theme_slug', 'name', 'grades_note', 'description', 'sort_order'],
  offering: ['tracks', 'note', 'sort_order'],
  event: ['title', 'starts_at', 'all_day', 'location', 'url', 'description', 'school_loc', 'featured'],
} as const

const TABLE = {
  theme: 'bcps_magnet_themes',
  school: 'bcps_magnet_schools',
  program: 'bcps_magnet_programs',
  offering: 'bcps_magnet_offerings',
  event: 'bcps_magnet_events',
} as const

// Keys that identify a row; they never change on update.
const KEY_COL: Record<Kind, string> = { theme: 'slug', school: 'loc_nbr', program: 'slug', offering: 'id', event: 'id' }

// School Choice window (bcps_magnet_settings 'school_choice'): dates as
// YYYY-MM-DD, read in Eastern time by the embed.
function schoolChoiceValue(v: Record<string, any>) {
  const day = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null)
  const text = (t: unknown) => (typeof t === 'string' && t.trim() ? t.trim() : null)
  return { opens: day(v.opens), closes: day(v.closes), apply_url: text(v.apply_url), message: text(v.message) }
}

type Kind = keyof typeof TABLE

function pick(kind: Kind, body: Record<string, any>) {
  const out: Record<string, any> = {}
  for (const f of FIELDS[kind]) if (f in body) out[f] = body[f] === '' ? null : body[f]
  if ('tracks' in out) out.tracks = cleanList(out.tracks)
  if ('levels' in out) out.levels = cleanList(out.levels)
  return out
}

function cleanList(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map(s => String(s).trim()).filter(Boolean)
}

function slugify(s: string) {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item'
}

// First free slug: name, then name-2, name-3...
async function freeSlug(table: string, base: string) {
  const { data } = await svc.from(table).select('slug').like('slug', `${base}%`)
  const taken = new Set((data ?? []).map(r => r.slug))
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`
}

// Street address to map pin via the US Census geocoder (free, no key). Returns
// null when the address doesn't match so the save still goes through; the
// editor can type coordinates by hand.
async function geocode(address?: string | null, city?: string | null, zip?: string | null) {
  if (!address) return null
  const line = [address, city, 'FL', zip].filter(Boolean).join(', ')
  try {
    const r = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address='
      + encodeURIComponent(line), { signal: AbortSignal.timeout(6000) })
    const m = (await r.json())?.result?.addressMatches?.[0]?.coordinates
    if (typeof m?.x !== 'number' || typeof m?.y !== 'number') return null
    return { lat: Math.round(m.y * 1e6) / 1e6, lng: Math.round(m.x * 1e6) / 1e6 }
  } catch {
    return null
  }
}

// GET /api/bcps/magnet-programs - every table and the School Choice window for the admin editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [themes, schools, programs, offerings, events, settings] = await Promise.all([
    svc.from(TABLE.theme).select('*').order('sort_order'),
    svc.from(TABLE.school).select('*').order('name'),
    svc.from(TABLE.program).select('*').order('sort_order'),
    svc.from(TABLE.offering).select('*').order('sort_order'),
    svc.from(TABLE.event).select('*').order('starts_at'),
    svc.from('bcps_magnet_settings').select('key, value'),
  ])
  const failed = [themes, schools, programs, offerings, events, settings].find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  const res = NextResponse.json({
    ok: true,
    themes: themes.data ?? [], schools: schools.data ?? [],
    programs: programs.data ?? [], offerings: offerings.data ?? [],
    events: events.data ?? [],
    school_choice: schoolChoiceValue((settings.data ?? []).find(r => r.key === 'school_choice')?.value ?? {}),
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

// POST /api/bcps/magnet-programs - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string
  const now = () => new Date().toISOString()

  try {
    switch (a) {
      case 'theme_create':
      case 'program_create': {
        const kind: Kind = a === 'theme_create' ? 'theme' : 'program'
        const name = String(body.name ?? '').trim()
        if (!name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        if (kind === 'program' && !body.theme_slug) return NextResponse.json({ error: 'theme required.' }, { status: 400 })
        const slug = await freeSlug(TABLE[kind], slugify(name))
        const { data, error } = await svc.from(TABLE[kind]).insert({ ...pick(kind, body), name, slug }).select().single()
        if (error) throw error
        await audit(user.id, `magnet_${a}`, { slug, name })
        return NextResponse.json({ ok: true, row: data }, { status: 201 })
      }
      case 'school_create': {
        const loc = String(body.loc_nbr ?? '').trim()
        if (!/^\d{4}$/.test(loc)) return NextResponse.json({ error: 'A 4-digit school location number is required.' }, { status: 400 })
        // Fill blanks from the district school record when the location exists.
        const { data: base } = await svc.from('bcps_schools').select('name, site_url').eq('school_location_nbr', loc).maybeSingle()
        const { data: dir } = await svc.from('bcps_school_directory').select('region').eq('loc_no', loc).maybeSingle()
        const row = pick('school', body)
        row.name = row.name || base?.name
        row.site_url = row.site_url || base?.site_url || null
        row.region = row.region || dir?.region || null
        if (!row.name) return NextResponse.json({ error: 'name required (no district school found for that location number).' }, { status: 400 })
        if (row.lat == null || row.lng == null) Object.assign(row, await geocode(row.address, row.city, row.zip))
        const { data, error } = await svc.from(TABLE.school).insert({ ...row, loc_nbr: loc }).select().single()
        if (error) throw error
        await audit(user.id, 'magnet_school_create', { loc_nbr: loc, name: row.name })
        return NextResponse.json({ ok: true, row: data }, { status: 201 })
      }
      case 'offering_create': {
        const { program_slug, school_loc } = body
        if (!program_slug || !school_loc) return NextResponse.json({ error: 'program and school required.' }, { status: 400 })
        const { data, error } = await svc.from(TABLE.offering)
          .insert({ ...pick('offering', body), program_slug, school_loc }).select().single()
        if (error) throw error
        await audit(user.id, 'magnet_offering_create', { program_slug, school_loc })
        return NextResponse.json({ ok: true, row: data }, { status: 201 })
      }
      case 'event_create': {
        const row = pick('event', body)
        if (!row.title || !row.starts_at) return NextResponse.json({ error: 'title and date required.' }, { status: 400 })
        const { data, error } = await svc.from(TABLE.event).insert(row).select().single()
        if (error) throw error
        await audit(user.id, 'magnet_event_create', { title: row.title, starts_at: row.starts_at })
        return NextResponse.json({ ok: true, row: data }, { status: 201 })
      }
      case 'school_choice_update': {
        const value = schoolChoiceValue(body)
        if (value.opens && value.closes && value.opens > value.closes) return NextResponse.json({ error: 'The window must open before it closes.' }, { status: 400 })
        const { error } = await svc.from('bcps_magnet_settings')
          .upsert({ key: 'school_choice', value, updated_at: now() })
        if (error) throw error
        await audit(user.id, 'magnet_school_choice_update', value)
        return NextResponse.json({ ok: true, school_choice: value })
      }
      case 'theme_update':
      case 'school_update':
      case 'program_update':
      case 'offering_update':
      case 'event_update': {
        const kind = a.split('_')[0] as Kind
        const keyCol = KEY_COL[kind]
        const key = body[keyCol]
        if (!key) return NextResponse.json({ error: `${keyCol} required.` }, { status: 400 })
        const updates = pick(kind, body)
        if (kind === 'school' && 'name' in updates && !updates.name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        if ((kind === 'theme' || kind === 'program') && 'name' in updates && !updates.name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        if (kind === 'event' && (('title' in updates && !updates.title) || ('starts_at' in updates && !updates.starts_at))) return NextResponse.json({ error: 'title and date required.' }, { status: 400 })
        // A new address moves the map pin unless the editor also set coordinates.
        if (kind === 'school' && ['address', 'city', 'zip'].some(f => f in updates) && !('lat' in updates || 'lng' in updates)) {
          const { data: cur } = await svc.from(TABLE.school).select('address, city, zip').eq('loc_nbr', key).maybeSingle()
          const next = { ...cur, ...updates }
          if (cur && ['address', 'city', 'zip'].some(f => (cur as any)[f] !== (next as any)[f])) {
            Object.assign(updates, await geocode(next.address, next.city, next.zip))
          }
        }
        const { data, error } = await svc.from(TABLE[kind])
          .update({ ...updates, updated_at: now() }).eq(keyCol, key).select().single()
        if (error) throw error
        await audit(user.id, `magnet_${a}`, { [keyCol]: key, updates })
        return NextResponse.json({ ok: true, row: data })
      }
      case 'theme_delete':
      case 'school_delete':
      case 'program_delete':
      case 'offering_delete':
      case 'event_delete': {
        const kind = a.split('_')[0] as Kind
        const keyCol = KEY_COL[kind]
        const key = body[keyCol]
        if (!key) return NextResponse.json({ error: `${keyCol} required.` }, { status: 400 })
        if (kind === 'theme') {
          const { count } = await svc.from(TABLE.program).select('slug', { count: 'exact', head: true }).eq('theme_slug', key)
          if (count) return NextResponse.json({ error: `Move or delete this theme's ${count} program${count === 1 ? '' : 's'} first.` }, { status: 400 })
        }
        // Schools and programs take their school-program links with them (ON DELETE CASCADE).
        const { error } = await svc.from(TABLE[kind]).delete().eq(keyCol, key)
        if (error) throw error
        await audit(user.id, `magnet_${a}`, { [keyCol]: key })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
