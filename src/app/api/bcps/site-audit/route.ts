import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deptAccessFor, identifyCaller } from '@/lib/bcps-audit-auth'

// Full-site audit, read and queue (Sean, 2026-10-07).
//   GET  ?department_id= | ?school_id=      the site's pages, each with its
//        latest audit summary, every open issue across those pages (each
//        tagged with its page), plus queue progress
//   GET  ...&result_id=                     one page's full audit (checks,
//        screenshots, ADA results) for the viewer
//   GET  ?list=1                            every audited site (admins)
//   GET  ?department_id=&access=1           what the caller may do here
//        ({ view, run, wcm }), for the department page's Run Audit button
//   POST { department_id | school_id }      queue a full-site audit (admins)
//   POST { action: 'add_page', department_id, url }
//        Add a missing page (Sean, 2026-10-20): the department's WCM (or the
//        District Web Team) adds a browardschools.com page the page finder
//        missed; it joins the department's page list and is audited next.
// Departments: admins, the department's WCM and its director may view.
// Schools: admins only for now.
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const FULL = 'id, department_id, school_id, site_page_id, run_id, audited_at, page_url, audit_version, overall_score, ada_score, checks, checks_passed, checks_failed, checks_review, screenshots, ada_violations, run_by'
const SUMMARY = 'id, site_page_id, run_id, audited_at, page_url, overall_score, ada_score, checks_passed, checks_failed, checks_review'

async function access(req: NextRequest, owner: { department_id?: string | null; school_id?: string | null }) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return { ok: false as const, status: caller.status }
  if (owner.school_id) return caller.admin ? { ok: true as const, caller, run: true, wcm: false } : { ok: false as const, status: 403 }
  const { data: dept } = await supabase.from('bcps_departments').select('id, wcm_email, director_email').eq('id', owner.department_id).maybeSingle()
  if (!dept) return { ok: false as const, status: 404 }
  const a = await deptAccessFor(supabase, caller, dept)
  return a.view ? { ok: true as const, caller, run: a.run, wcm: a.wcm } : { ok: false as const, status: 403 }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  // ?list=1 (admins): every site with audited pages, for the dashboard's
  // scan picker.
  if (q.get('list')) {
    const caller = await identifyCaller(req, supabase)
    if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
    if (!caller.admin) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    const { data: rows } = await supabase.from('bcps_site_pages').select('department_id, school_id, bcps_departments(name), bcps_schools(name)').eq('active', true).limit(5000)
    const sites = new Map<string, { kind: 'department' | 'school'; id: string; name: string; pages: number }>()
    for (const r of rows ?? []) {
      const kind = r.department_id ? 'department' : 'school'
      const id = (r.department_id ?? r.school_id) as string
      if (!id) continue
      const owner = (kind === 'department' ? r.bcps_departments : r.bcps_schools) as unknown as { name: string } | null
      const s = sites.get(id) ?? { kind, id, name: owner?.name ?? 'Unnamed', pages: 0 }
      s.pages++; sites.set(id, s)
    }
    return NextResponse.json({ sites: Array.from(sites.values()).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)) })
  }
  const owner = { department_id: q.get('department_id'), school_id: q.get('school_id') }
  if (!owner.department_id && !owner.school_id) return NextResponse.json({ error: 'department_id or school_id required' }, { status: 400 })
  const ok = await access(req, owner)
  if (q.get('access')) return NextResponse.json(ok.ok ? { view: true, run: ok.run, wcm: ok.wcm } : { view: false, run: false, wcm: false })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  const col = owner.department_id ? 'department_id' : 'school_id'
  const id = (owner.department_id ?? owner.school_id) as string

  const resultId = q.get('result_id')
  if (resultId) {
    const { data } = await supabase.from('bcps_audit_results').select(FULL).eq('id', resultId).eq(col, id).maybeSingle()
    return data ? NextResponse.json({ result: data }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: pages }, { data: results }, { data: queue }] = await Promise.all([
    supabase.from('bcps_site_pages').select('id, url, title, is_main, active, source').eq(col, id).eq('active', true).order('is_main', { ascending: false }).order('url'),
    supabase.from('bcps_audit_results').select(SUMMARY).eq(col, id).gte('audit_version', 3).order('audited_at', { ascending: false }).limit(300),
    supabase.from('bcps_audit_queue').select('status, kind').eq(col, id).in('status', ['queued', 'running']),
  ])
  // Latest result per page; the main page falls back to an audit from before
  // site runs existed (no site_page_id).
  const latest = new Map<string, NonNullable<typeof results>[number]>()
  for (const r of results ?? []) if (r.site_page_id && !latest.has(r.site_page_id)) latest.set(r.site_page_id, r)
  const legacyMain = (results ?? []).find((r) => !r.site_page_id)
  const list = (pages ?? []).map((p) => ({ ...p, result: latest.get(p.id) ?? (p.is_main ? legacyMain ?? null : null) }))
  if (!list.length && legacyMain) list.push({ id: 'main', url: legacyMain.page_url ?? '', title: null, is_main: true, active: true, source: 'main', result: legacyMain })
  const scored = list.filter((p) => p.result?.overall_score != null)

  // Every red and amber check on every page's latest audit, slimmed to what
  // the site-wide list shows. The full check loads with the page.
  const byResult = new Map(list.filter((p) => p.result).map((p) => [p.result!.id, p.id]))
  const issues: { page_id: string; result_id: string; check_id: string; area: string; title: string; detail: string; status: string }[] = []
  if (byResult.size) {
    const { data: checkRows } = await supabase.from('bcps_audit_results').select('id, checks').in('id', Array.from(byResult.keys()))
    for (const r of checkRows ?? []) {
      for (const c of (Array.isArray(r.checks) ? r.checks : []) as { id: string; area: string; title: string; detail: string; status: string }[]) {
        if (c.status === 'pass') continue
        issues.push({ page_id: byResult.get(r.id)!, result_id: r.id, check_id: c.id, area: c.area, title: c.title, detail: c.detail, status: c.status })
      }
    }
  }
  return NextResponse.json({
    pages: list,
    issues,
    site_score: scored.length ? Math.round(scored.reduce((n, p) => n + (p.result!.overall_score as number), 0) / scored.length) : null,
    in_progress: (queue ?? []).length,
    can_run: ok.run,
    can_add: !!owner.department_id && (ok.wcm || ok.caller.admin),
  })
}

// A page on the district site, cleaned the way the page finder stores it.
const SITE_HOSTS = new Set(['www.browardschools.com', 'browardschools.com'])
function cleanPageUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (!['https:', 'http:'].includes(u.protocol) || !SITE_HOSTS.has(u.hostname.toLowerCase())) return null
  return `https://www.browardschools.com${u.pathname.replace(/\/+$/, '') || '/'}`
}

async function addPage(req: NextRequest, body: { department_id?: string; url?: string }) {
  if (!body.department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })
  const ok = await access(req, { department_id: body.department_id })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.wcm && !ok.caller.admin) return NextResponse.json({ error: 'Only this department\u2019s WCM can add pages to its audit.' }, { status: 403 })
  const asked = cleanPageUrl(body.url ?? '')
  if (!asked) return NextResponse.json({ error: 'Paste the full address of a page on browardschools.com.' }, { status: 400 })
  // Follow it the way a visitor would (short /fs/pages/ links land somewhere
  // else) and keep where it lands, which must still be on the district site.
  let landed = asked
  let title: string | null = null
  try {
    const ctl = new AbortController()
    const tm = setTimeout(() => ctl.abort(), 15000)
    const res = await fetch(asked, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (BCPS MarComm department audit)' } })
    clearTimeout(tm)
    if (!res.ok) return NextResponse.json({ error: `That page did not open (${res.status}). Check the address and try again.` }, { status: 422 })
    const final = cleanPageUrl(res.url || asked)
    if (!final) return NextResponse.json({ error: 'That link leads off browardschools.com, so it cannot be part of the audit.' }, { status: 422 })
    landed = final
    const html = await res.text()
    title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').replace(/\s*-\s*Broward County Public Schools\s*$/i, '').replace(/&amp;/g, '&').trim() || null
  } catch {
    return NextResponse.json({ error: 'That page did not answer. Check the address and try again.' }, { status: 422 })
  }
  const { data: existing } = await supabase.from('bcps_site_pages').select('id, active').eq('department_id', body.department_id).eq('url', landed).maybeSingle()
  if (existing?.active) return NextResponse.json({ error: 'That page is already part of this audit.' }, { status: 409 })
  let pageId = existing?.id as string | undefined
  if (existing) {
    await supabase.from('bcps_site_pages').update({ active: true, last_seen_at: new Date().toISOString(), ...(title ? { title } : {}) }).eq('id', existing.id)
  } else {
    const { data: ins, error } = await supabase.from('bcps_site_pages')
      .insert({ department_id: body.department_id, url: landed, title, is_main: false, source: 'wcm_added', added_by: ok.caller.email })
      .select('id').single()
    if (error || !ins) return NextResponse.json({ error: error?.message || 'Could not add the page.' }, { status: 500 })
    pageId = ins.id
  }
  // Audited next, as part of the department's latest site run.
  const { data: lastRun } = await supabase.from('bcps_audit_results').select('run_id').eq('department_id', body.department_id).not('run_id', 'is', null).order('audited_at', { ascending: false }).limit(1).maybeSingle()
  await supabase.from('bcps_audit_queue').insert({
    department_id: body.department_id, site_page_id: pageId, kind: 'page', run_id: lastRun?.run_id ?? null,
    run_month: new Date().toISOString().slice(0, 7) + '-01', requested_by: ok.caller.email,
  })
  return NextResponse.json({ ok: true, page: { id: pageId, url: landed, title } })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { action?: string; department_id?: string; school_id?: string; url?: string }
  if (body.action === 'add_page') return addPage(req, body)
  const owner = { department_id: body.department_id ?? null, school_id: body.school_id ?? null }
  if (!owner.department_id && !owner.school_id) return NextResponse.json({ error: 'department_id or school_id required' }, { status: 400 })
  const ok = await access(req, owner)
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.caller.admin) return NextResponse.json({ error: 'Only the District Web Team can start a full-site audit.' }, { status: 403 })
  const col = owner.department_id ? 'department_id' : 'school_id'
  const { data: busy } = await supabase.from('bcps_audit_queue').select('id').eq(col, (owner.department_id ?? owner.school_id) as string).in('status', ['queued', 'running']).limit(1).maybeSingle()
  if (busy) return NextResponse.json({ ok: true, already: true })
  const { error } = await supabase.from('bcps_audit_queue').insert({ ...owner, kind: 'site', run_month: new Date().toISOString().slice(0, 7) + '-01', requested_by: ok.caller.email })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, queued: true })
}
