import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'early-childhood-programs'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the Early Childhood
// Programs Directory. Same check that guards the II&DL Services Directory and the
// Charter School Directory (requireEditor in src/app/api/bcps/iidl-services/route.ts),
// pointed at the early-childhood-programs page object: superadmin, brand-level
// admin, or anyone granted 'edit'/'manage' on that object directly or through a
// group. The Widgets hub (src/app/api/bcps/widgets/route.ts) computes can_edit from
// the same grants, so the Edit button and this route always agree.
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

// Fields an editor may set. Anything else in the request body is ignored, so a
// client can never write id/created_at or an unknown column.
const TEXT_FIELDS = ['name', 'address', 'city', 'zip', 'phone', 'review_note'] as const
const FLAG_FIELDS = ['early_head_start', 'head_start', 'vpk_free_full_day', 'vpk_tuition_supported'] as const
const COORD_FIELDS = ['lat', 'lng'] as const
const PROGRAM_FIELDS = ['name', 'card_label', 'cost_label', 'ages_label', 'explainer', 'learn_more_url'] as const
const PROGRAM_REQUIRED = ['name', 'card_label', 'cost_label', 'ages_label'] as const
const SETTINGS_FIELDS = ['apply_note', 'contact_label', 'contact_email', 'contact_url'] as const

// Blank text clears the field instead of storing an empty string, so the embed's
// "only show what is real" checks keep working.
function text(v: unknown) {
  return typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v
}

function pickText(body: Record<string, unknown>, fields: readonly string[]) {
  const out: Record<string, unknown> = {}
  for (const f of fields) if (f in body) out[f] = text(body[f])
  return out
}

function pickSchool(body: Record<string, unknown>) {
  const out = pickText(body, TEXT_FIELDS)
  for (const f of FLAG_FIELDS) if (f in body) out[f] = body[f] === true
  for (const f of COORD_FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    const n = v === null || v === '' ? null : Number(v)
    out[f] = n !== null && Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null
  }
  if ('sort_order' in body && Number.isFinite(Number(body.sort_order))) out.sort_order = Number(body.sort_order)
  return out
}

// Public links only: http(s) for pages, a plain address for email. Anything else is rejected.
function badUrl(v: unknown) {
  return typeof v === 'string' && !/^https?:\/\/\S+$/i.test(v)
}
function badEmail(v: unknown) {
  return typeof v === 'string' && !/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(v)
}

// Street address to map pin via the US Census geocoder (free, no key). Returns null
// when the address doesn't match so the save still goes through; the editor shows
// that the pin is missing and the nearest-school search skips that school.
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

// GET /api/bcps/early-childhood-programs - schools (including review_note), programs
// and the apply/contact settings for the admin editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [schools, programs, settings] = await Promise.all([
    svc.from('bcps_early_childhood_schools').select('*').order('sort_order'),
    svc.from('bcps_early_childhood_programs').select('*').order('sort_order'),
    svc.from('bcps_early_childhood_settings').select('*').eq('id', 1).maybeSingle(),
  ])
  const error = schools.error || programs.error || settings.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    schools: schools.data ?? [],
    programs: programs.data ?? [],
    settings: settings.data ?? {},
  })
}

// POST /api/bcps/early-childhood-programs - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'school_create': {
        const fields = pickSchool(body)
        if (!fields.name) return NextResponse.json({ error: 'name required.' }, { status: 400 })
        if (fields.lat == null || fields.lng == null) {
          Object.assign(fields, (await geocode(fields.address as string, fields.city as string, fields.zip as string)) ?? {})
        }
        const { data, error } = await svc.from('bcps_early_childhood_schools').insert(fields).select().single()
        if (error) throw error
        await audit(user.id, 'early_childhood_school_create', { name: fields.name })
        return NextResponse.json({ ok: true, school: data }, { status: 201 })
      }
      case 'school_update': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const updates = pickSchool(body)
        if ('name' in updates && !updates.name) return NextResponse.json({ error: 'name cannot be blank.' }, { status: 400 })

        // A changed address gets a fresh pin. If it cannot be matched the old pin is
        // cleared rather than left pointing at the previous address.
        const addressTouched = ['address', 'city', 'zip'].some(f => f in updates) && !('lat' in updates)
        if (addressTouched) {
          const { data: current } = await svc.from('bcps_early_childhood_schools').select('address, city, zip').eq('id', id).maybeSingle()
          const next = { ...(current ?? {}), ...updates } as { address?: string; city?: string; zip?: string }
          const changed = ['address', 'city', 'zip'].some(f => f in updates && (current as Record<string, unknown> | null)?.[f] !== updates[f])
          if (changed) {
            const pin = await geocode(next.address, next.city, next.zip)
            updates.lat = pin?.lat ?? null
            updates.lng = pin?.lng ?? null
          }
        }

        const { data, error } = await svc.from('bcps_early_childhood_schools')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) throw error
        await audit(user.id, 'early_childhood_school_update', { id, updates })
        return NextResponse.json({ ok: true, school: data })
      }
      case 'school_delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from('bcps_early_childhood_schools').delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'early_childhood_school_delete', { id })
        return NextResponse.json({ ok: true })
      }
      case 'program_update': {
        const { slug } = body
        if (!slug) return NextResponse.json({ error: 'slug required.' }, { status: 400 })
        const updates = pickText(body, PROGRAM_FIELDS)
        for (const f of PROGRAM_REQUIRED) {
          if (f in updates && !updates[f]) return NextResponse.json({ error: `${f.replace('_', ' ')} cannot be blank.` }, { status: 400 })
        }
        if (badUrl(updates.learn_more_url)) return NextResponse.json({ error: 'The learn more link must start with http:// or https://.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_early_childhood_programs')
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('slug', slug).select().single()
        if (error) throw error
        await audit(user.id, 'early_childhood_program_update', { slug, updates })
        return NextResponse.json({ ok: true, program: data })
      }
      case 'settings_update': {
        const updates = pickText(body, SETTINGS_FIELDS)
        if (badEmail(updates.contact_email)) return NextResponse.json({ error: 'Enter one email address, for example name@browardschools.com.' }, { status: 400 })
        if (badUrl(updates.contact_url)) return NextResponse.json({ error: 'The contact link must start with http:// or https://.' }, { status: 400 })
        const { data, error } = await svc.from('bcps_early_childhood_settings')
          .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single()
        if (error) throw error
        await audit(user.id, 'early_childhood_settings_update', { updates })
        return NextResponse.json({ ok: true, settings: data })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
