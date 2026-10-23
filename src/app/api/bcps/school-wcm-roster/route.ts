// app/api/bcps/school-wcm-roster/route.ts
//
// School WCM roster (Sean + Vanessa Deslandes, 2026-10-23): every school's
// WCMs from the BCPS Central "WCM List" export, with certification status,
// live-site or sandbox access and who designated them. A school can have
// several WCMs; bcps_schools keeps only one, so this is the full list.
//
// GET   District Web Team: every row, for the Schools tab and email lists.
// POST  District Web Team: { html } is the BCPS Central export as downloaded
//       (an HTML table saved as .xls). Rows upsert by P-number, so uploading
//       a newer export updates people in place. Nothing is deleted.
//
// Every WCM on the roster gets their school's dashboard (Sean, 2026-10-23,
// certified or not); /api/bcps/home and /api/bcps/school-profile read it.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function requireTeam(req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  const [roleRes, gmRes, bannerRes] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle(),
    svc.from('acl_group_members').select('group_id').eq('user_id', user.id),
    svc.from('bcps_banner_admins').select('role').eq('user_id', user.id).maybeSingle(),
  ])
  const role = roleRes.data?.role || 'user'
  if (role === 'admin' || role === 'superadmin' || bannerRes.data) return user.email || ''
  const gids = (gmRes.data ?? []).map((g) => g.group_id as string)
  if (!gids.length) return null
  const { data: gRows } = await svc.from('acl_groups').select('name').eq('brand', BRAND).in('id', gids)
  return (gRows ?? []).some((g) => g.name === 'District Web Team') ? user.email || '' : null
}

const ROSTER_COLUMNS = 'p_number, loc_no, full_name, email, cert_status, site_access, cert_due_on, designated_by, designated_on, access_end'

export async function GET(req: NextRequest) {
  if (!(await requireTeam(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from('bcps_school_wcm_roster').select(`${ROSTER_COLUMNS}, imported_at`).order('loc_no').limit(5000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, roster: data ?? [] })
}

const decode = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
// "9/23/2026" -> "2026-09-23"; "-" or blank -> null
const isoDate = (s: string) => { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null }
const text = (s: string) => (s && s !== '-' ? s : null)

export async function POST(req: NextRequest) {
  const who = await requireTeam(req)
  if (!who) return NextResponse.json({ error: 'Only the District Web Team can upload the WCM list.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { html?: string }
  const html = body.html || ''
  const trs = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []
  const table = trs.map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map(decode))
  const header = table[0] ?? []
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase())
  const need = ['Location', 'Name', 'Email', 'PNumber', 'Status']
  if (need.some((n) => col(n) < 0)) return NextResponse.json({ error: 'This does not look like the BCPS Central WCM List export (missing Location, Name, Email, PNumber or Status).' }, { status: 400 })
  const get = (r: string[], name: string) => { const i = col(name); return i >= 0 ? r[i] ?? '' : '' }

  const rows = table.slice(1).map((r) => {
    const loc = get(r, 'Location').match(/\((\d+)\)\s*$/)?.[1]
    const p = get(r, 'PNumber').trim().toLowerCase()
    if (!loc || !p) return null
    return {
      p_number: p,
      loc_no: loc.padStart(4, '0'),
      central_location: get(r, 'Location'),
      full_name: text(get(r, 'Name')),
      email: text(get(r, 'Email').trim().toLowerCase()),
      cert_status: text(get(r, 'Status')),
      site_access: text(get(r, 'Website Access Status')),
      enrolled_on: isoDate(get(r, 'Enrollment Date')),
      cert_due_on: isoDate(get(r, 'Enrollment Due Date')),
      designated_by: text(get(r, 'Designated as WCM by')),
      designated_on: isoDate(get(r, 'Designated as WCM Date')),
      access_start: isoDate(get(r, 'Valid Start Dates')),
      access_end: isoDate(get(r, 'Valid End Dates')),
      imported_at: new Date().toISOString(),
    }
  }).filter((r): r is NonNullable<typeof r> => !!r)
  if (!rows.length) return NextResponse.json({ error: 'No WCM rows were found in that file.' }, { status: 400 })

  const { error } = await svc.from('bcps_school_wcm_roster').upsert(rows, { onConflict: 'p_number' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const schools = new Set(rows.map((r) => r.loc_no)).size
  await svc.from('bcps_school_activity').insert({ loc_no: 'all', kind: 'roster_import', actor_email: who.toLowerCase(), subject: `WCM list uploaded: ${rows.length} WCMs at ${schools} schools` })
  return NextResponse.json({ ok: true, wcms: rows.length, schools })
}
