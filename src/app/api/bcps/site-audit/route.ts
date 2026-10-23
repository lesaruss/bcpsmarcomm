import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deptAccessFor, identifyCaller } from '@/lib/bcps-audit-auth'
import { requireNamedPageGrant } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'

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
//   POST { action: 'mark', department_id, result_id, check_id, done, note? }
//   POST { action: 'submit', department_id }
//        WCMs report their fixes (Sean, 2026-10-20): each red or amber item
//        on a page's latest audit is marked done; when all are, submit
//        records it on the current round, sets WCM: Submitted and queues a
//        full-site re-audit (migration 20261020_bcps_audit_check_marks).
//   POST { action: 'reclass', department_id, page_ids, note? }
//   POST { action: 'reclass_withdraw', department_id, request_id }
//   POST { action: 'reclass_resolve', request_id, outcome: keep | move | remove, to_department_id? }
//   GET  ?reclass=1                         open requests everywhere (admins)
//        Pages the WCM does not manage (Sean, 2026-10-20, Patricia Sapp's
//        EEO/ADA pages): the WCM marks them for reclassification; until the
//        District Web Team decides, their items leave the WCM's walk and do
//        not count toward the re-audit (migration 20261020_bcps_page_reclass).
// Departments: admins, the department's WCM and its director may view.
// Schools: admins only for now.
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const FULL = 'id, department_id, school_id, site_page_id, run_id, audited_at, page_url, audit_version, overall_score, ada_score, checks, checks_passed, checks_failed, checks_review, screenshots, ada_violations, run_by'
const SUMMARY = 'id, site_page_id, run_id, audited_at, page_url, overall_score, ada_score, checks_passed, checks_failed, checks_review'

// The District Web Team (its group, a District Web Team Lead or a banner
// reviewer) or one of the school's WCMs (bcps_schools.wcm_email or the BCPS
// Central roster).
async function canViewSchool(caller: { email: string; userId?: string }, schoolId: string): Promise<boolean> {
  const email = caller.email
  if (!email) return false
  const { data: school } = await supabase.from('bcps_schools').select('wcm_email, school_location_nbr').eq('id', schoolId).maybeSingle()
  if (!school) return false
  if ((school.wcm_email || '').trim().toLowerCase() === email) return true
  const loc = (school.school_location_nbr || '').replace(/^0+/, '')
  const [roster, lead, banner, gm] = await Promise.all([
    loc ? supabase.from('bcps_school_wcm_roster').select('p_number').eq('email', email).in('loc_no', [loc, loc.padStart(4, '0')]).limit(1) : Promise.resolve({ data: [] }),
    supabase.from('bcps_support_leads').select('email').eq('email', email).maybeSingle(),
    caller.userId ? supabase.from('bcps_banner_admins').select('role').eq('user_id', caller.userId).maybeSingle() : Promise.resolve({ data: null }),
    caller.userId ? supabase.from('acl_group_members').select('group_id').eq('user_id', caller.userId) : Promise.resolve({ data: [] }),
  ])
  if ((roster.data ?? []).length || lead.data || banner.data) return true
  const gids = (gm.data ?? []).map((g) => g.group_id as string)
  if (!gids.length) return false
  const { data: groups } = await supabase.from('acl_groups').select('name').eq('brand', 'bcps').in('id', gids)
  return (groups ?? []).some((g) => g.name === 'District Web Team')
}

async function access(req: NextRequest, owner: { department_id?: string | null; school_id?: string | null }) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return { ok: false as const, status: caller.status }
  if (owner.school_id) {
    if (caller.admin) return { ok: true as const, caller, run: true, wcm: false }
    // The School Profile's Web Review (2026-10-23): the District Web Team and
    // the school's own WCMs see the school's audit. Running it stays admin.
    return (await canViewSchool(caller, owner.school_id)) ? { ok: true as const, caller, run: false, wcm: false } : { ok: false as const, status: 403 }
  }
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
  if (q.get('reclass')) {
    const caller = await identifyCaller(req, supabase)
    if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
    if (!caller.admin) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    const [{ data: reqs }, { data: depts }] = await Promise.all([
      supabase.from('bcps_page_reclass_requests').select('id, department_id, note, requested_by, requested_at, bcps_departments!bcps_page_reclass_requests_department_id_fkey(name), bcps_site_pages(url, title)').eq('status', 'open').order('requested_at'),
      supabase.from('bcps_departments').select('id, name').order('name'),
    ])
    return NextResponse.json({
      requests: (reqs ?? []).map((r) => {
        const page = r.bcps_site_pages as unknown as { url: string; title: string | null } | null
        return { id: r.id, department_id: r.department_id, department: (r.bcps_departments as unknown as { name: string } | null)?.name ?? '', url: page?.url ?? '', title: page?.title ?? null, note: r.note, by: r.requested_by, at: r.requested_at }
      }),
      departments: depts ?? [],
    })
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
  const issues: { page_id: string; result_id: string; check_id: string; area: string; title: string; detail: string; status: string; done?: { by: string; at: string; note: string | null } | null }[] = []
  if (byResult.size) {
    const { data: checkRows } = await supabase.from('bcps_audit_results').select('id, checks').in('id', Array.from(byResult.keys()))
    for (const r of checkRows ?? []) {
      for (const c of (Array.isArray(r.checks) ? r.checks : []) as { id: string; area: string; title: string; detail: string; status: string }[]) {
        if (c.status === 'pass') continue
        issues.push({ page_id: byResult.get(r.id)!, result_id: r.id, check_id: c.id, area: c.area, title: c.title, detail: c.detail, status: c.status })
      }
    }
    const { data: marks } = owner.department_id
      ? await supabase.from('bcps_audit_check_marks').select('result_id, check_id, marked_by, marked_at, note').in('result_id', Array.from(byResult.keys()))
      : { data: [] as { result_id: string; check_id: string; marked_by: string; marked_at: string; note: string | null }[] }
    const markOf = new Map((marks ?? []).map((m) => [`${m.result_id}:${m.check_id}`, m]))
    for (const i of issues) {
      const m = markOf.get(`${i.result_id}:${i.check_id}`)
      i.done = m ? { by: m.marked_by, at: m.marked_at, note: m.note } : null
    }
  }
  const [{ data: deptRow }, { data: reclass }, { data: departments }] = owner.department_id
    ? await Promise.all([
        supabase.from('bcps_departments').select('audit_status, wcm_submitted_at').eq('id', owner.department_id).maybeSingle(),
        supabase.from('bcps_page_reclass_requests').select('id, site_page_id, note, requested_by, requested_at').eq('department_id', owner.department_id).eq('status', 'open'),
        ok.caller.admin ? supabase.from('bcps_departments').select('id, name').order('name') : Promise.resolve({ data: null }),
      ])
    : [{ data: null }, { data: null }, { data: null }]
  return NextResponse.json({
    pages: list,
    issues,
    site_score: scored.length ? Math.round(scored.reduce((n, p) => n + (p.result!.overall_score as number), 0) / scored.length) : null,
    in_progress: (queue ?? []).length,
    can_run: ok.run,
    can_add: !!owner.department_id && (ok.wcm || ok.caller.admin),
    can_mark: !!owner.department_id && (ok.wcm || ok.caller.admin),
    submitted: deptRow?.audit_status === 'wcm_submitted' ? deptRow.wcm_submitted_at : null,
    reclass: (reclass ?? []).map((r) => ({ id: r.id, page_id: r.site_page_id, note: r.note, by: r.requested_by, at: r.requested_at })),
    can_resolve: !!owner.department_id && ok.caller.admin,
    departments: departments ?? undefined,
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

// Mark pages for reclassification: the WCM (or the District Web Team) flags
// pages another office manages. The main page cannot be flagged.
const WEB_TEAM_NOTIFY = ['sean.russell@browardschools.com']
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function reclassPages(req: NextRequest, body: { department_id?: string; page_ids?: unknown; note?: string }) {
  if (!body.department_id || !Array.isArray(body.page_ids) || !body.page_ids.length) return NextResponse.json({ error: 'Pick at least one page.' }, { status: 400 })
  const ok = await access(req, { department_id: body.department_id })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.wcm && !ok.caller.admin) return NextResponse.json({ error: 'Only this department\u2019s WCM can mark pages for reclassification.' }, { status: 403 })
  const ids = (body.page_ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 100)
  const [{ data: pages }, { data: open }, { data: dept }] = await Promise.all([
    supabase.from('bcps_site_pages').select('id, url, title, is_main').eq('department_id', body.department_id).eq('active', true).in('id', ids),
    supabase.from('bcps_page_reclass_requests').select('site_page_id').eq('department_id', body.department_id).eq('status', 'open'),
    supabase.from('bcps_departments').select('name').eq('id', body.department_id).maybeSingle(),
  ])
  const already = new Set((open ?? []).map((o) => o.site_page_id as string))
  const pick = (pages ?? []).filter((p) => !p.is_main && !already.has(p.id))
  if (!pick.length) return NextResponse.json({ error: 'Those pages are already marked, or one is your main page, which stays with your department.' }, { status: 409 })
  const note = (body.note ?? '').trim().slice(0, 1000) || null
  const { error } = await supabase.from('bcps_page_reclass_requests').insert(pick.map((p) => ({ department_id: body.department_id, site_page_id: p.id, note, requested_by: ok.caller.email })))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const name = dept?.name ?? 'A department'
  await sendEmail({
    to: WEB_TEAM_NOTIFY,
    subject: `${name}: ${pick.length} page${pick.length === 1 ? '' : 's'} marked for reclassification`,
    kind: 'bcps-page-reclass',
    context: { department_id: body.department_id, page_ids: pick.map((p) => p.id) },
    html: `<p>${esc(ok.caller.email ?? 'The WCM')} marked ${pick.length === 1 ? 'this page' : 'these pages'} on the ${esc(name)} audit as not theirs to manage:</p><ul>${pick.map((p) => `<li><a href="${esc(p.url)}">${esc(p.title || p.url)}</a></li>`).join('')}</ul>${note ? `<p>Their note: ${esc(note)}</p>` : ''}<p>Decide each one in Run Audit &gt; View a scan &gt; Reclassification requests on bcpsmarcomm.com: keep it there, move it to another department, or take it off the audit.</p>`,
  })
  return NextResponse.json({ ok: true, marked: pick.length })
}

async function withdrawReclass(req: NextRequest, body: { department_id?: string; request_id?: string }) {
  if (!body.department_id || !body.request_id) return NextResponse.json({ error: 'department_id and request_id required' }, { status: 400 })
  const ok = await access(req, { department_id: body.department_id })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.wcm && !ok.caller.admin) return NextResponse.json({ error: 'Only this department\u2019s WCM can change this.' }, { status: 403 })
  await supabase.from('bcps_page_reclass_requests').update({ status: 'withdrawn', resolved_by: ok.caller.email, resolved_at: new Date().toISOString() })
    .eq('id', body.request_id).eq('department_id', body.department_id).eq('status', 'open')
  return NextResponse.json({ ok: true })
}

// The District Web Team decides: keep it here, move it (retired here, added to
// the other department's site and audited there next), or take it off.
async function resolveReclass(req: NextRequest, body: { request_id?: string; outcome?: string; to_department_id?: string }) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
  if (!caller.admin) return NextResponse.json({ error: 'Only the District Web Team can decide this.' }, { status: 403 })
  if (!body.request_id || !['keep', 'move', 'remove'].includes(body.outcome ?? '')) return NextResponse.json({ error: 'request_id and outcome required' }, { status: 400 })
  const { data: r } = await supabase.from('bcps_page_reclass_requests').select('id, department_id, site_page_id, status, bcps_site_pages(url, title)').eq('id', body.request_id).maybeSingle()
  if (!r || r.status !== 'open') return NextResponse.json({ error: 'That request is already settled.' }, { status: 409 })
  const page = r.bcps_site_pages as unknown as { url: string; title: string | null } | null
  const now = new Date().toISOString()
  if (body.outcome === 'move') {
    if (!body.to_department_id || body.to_department_id === r.department_id) return NextResponse.json({ error: 'Pick the department it belongs to.' }, { status: 400 })
    const { data: to } = await supabase.from('bcps_departments').select('id').eq('id', body.to_department_id).maybeSingle()
    if (!to || !page) return NextResponse.json({ error: 'Department not found.' }, { status: 404 })
    const { data: there } = await supabase.from('bcps_site_pages').select('id, active').eq('department_id', to.id).eq('url', page.url).maybeSingle()
    let pageId = there?.id as string | undefined
    if (there) { if (!there.active) await supabase.from('bcps_site_pages').update({ active: true, last_seen_at: now }).eq('id', there.id) }
    else {
      const { data: ins, error } = await supabase.from('bcps_site_pages').insert({ department_id: to.id, url: page.url, title: page.title, is_main: false, source: 'manual', added_by: caller.email }).select('id').single()
      if (error || !ins) return NextResponse.json({ error: error?.message || 'Could not move the page.' }, { status: 500 })
      pageId = ins.id
    }
    if (!there?.active) await supabase.from('bcps_audit_queue').insert({ department_id: to.id, site_page_id: pageId, kind: 'page', run_month: now.slice(0, 7) + '-01', requested_by: caller.email })
  }
  if (body.outcome !== 'keep') await supabase.from('bcps_site_pages').update({ active: false }).eq('id', r.site_page_id)
  await supabase.from('bcps_page_reclass_requests').update({
    status: body.outcome === 'keep' ? 'kept' : body.outcome === 'move' ? 'moved' : 'removed',
    moved_to: body.outcome === 'move' ? body.to_department_id : null, resolved_by: caller.email, resolved_at: now,
  }).eq('id', r.id)
  return NextResponse.json({ ok: true })
}

// The red and amber items on each page's latest audit, and how many are marked done.
async function openItems(departmentId: string) {
  const [{ data: pages }, { data: results }, { data: flagged }] = await Promise.all([
    supabase.from('bcps_site_pages').select('id').eq('department_id', departmentId).eq('active', true),
    supabase.from('bcps_audit_results').select('id, site_page_id, checks').eq('department_id', departmentId).gte('audit_version', 3).not('site_page_id', 'is', null).order('audited_at', { ascending: false }).limit(300),
    supabase.from('bcps_page_reclass_requests').select('site_page_id').eq('department_id', departmentId).eq('status', 'open'),
  ])
  // A page waiting on reclassification is not the WCM's to fix.
  const away = new Set((flagged ?? []).map((f) => f.site_page_id as string))
  const live = new Set((pages ?? []).map((p) => p.id as string).filter((id) => !away.has(id)))
  const latest = new Map<string, { id: string; checks: unknown }>()
  for (const r of results ?? []) if (live.has(r.site_page_id as string) && !latest.has(r.site_page_id as string)) latest.set(r.site_page_id as string, r)
  const items: { result_id: string; check_id: string }[] = []
  for (const r of Array.from(latest.values())) {
    for (const c of (Array.isArray(r.checks) ? r.checks : []) as { id: string; status: string }[]) if (c.status !== 'pass') items.push({ result_id: r.id, check_id: c.id })
  }
  const { data: marks } = items.length
    ? await supabase.from('bcps_audit_check_marks').select('result_id, check_id').in('result_id', Array.from(new Set(items.map((i) => i.result_id))))
    : { data: [] as { result_id: string; check_id: string }[] }
  const done = new Set((marks ?? []).map((m) => `${m.result_id}:${m.check_id}`))
  return { total: items.length, done: items.filter((i) => done.has(`${i.result_id}:${i.check_id}`)).length, items }
}

async function markItem(req: NextRequest, body: { department_id?: string; result_id?: string; check_id?: string; done?: boolean; note?: string }) {
  if (!body.department_id || !body.result_id || !body.check_id) return NextResponse.json({ error: 'department_id, result_id and check_id required' }, { status: 400 })
  const ok = await access(req, { department_id: body.department_id })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.wcm && !ok.caller.admin) return NextResponse.json({ error: 'Only this department\u2019s WCM can mark items done.' }, { status: 403 })
  const { data: result } = await supabase.from('bcps_audit_results').select('id, checks').eq('id', body.result_id).eq('department_id', body.department_id).maybeSingle()
  const check = ((Array.isArray(result?.checks) ? result!.checks : []) as { id: string; status: string }[]).find((c) => c.id === body.check_id)
  if (!result || !check || check.status === 'pass') return NextResponse.json({ error: 'That item is not open on this audit.' }, { status: 404 })
  if (body.done === false) {
    await supabase.from('bcps_audit_check_marks').delete().eq('result_id', body.result_id).eq('check_id', body.check_id)
  } else {
    const { error } = await supabase.from('bcps_audit_check_marks').upsert({
      department_id: body.department_id, result_id: body.result_id, check_id: body.check_id,
      note: (body.note ?? '').trim().slice(0, 1000) || null, marked_by: ok.caller.email, marked_at: new Date().toISOString(),
    }, { onConflict: 'result_id,check_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const progress = await openItems(body.department_id)
  return NextResponse.json({ ok: true, total: progress.total, done: progress.done })
}

async function submitFixes(req: NextRequest, body: { department_id?: string }) {
  if (!body.department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })
  const ok = await access(req, { department_id: body.department_id })
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  if (!ok.wcm && !ok.caller.admin) return NextResponse.json({ error: 'Only this department\u2019s WCM can request a re-audit.' }, { status: 403 })
  const progress = await openItems(body.department_id)
  if (progress.done < progress.total) return NextResponse.json({ error: `Mark every item done first: ${progress.done} of ${progress.total} so far.` }, { status: 409 })
  const now = new Date().toISOString()
  // The submission goes on the department's latest round, the same fields
  // the round-by-round review already reads.
  const { data: round } = await supabase.from('bcps_audit_rounds').select('id').eq('department_id', body.department_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (round) await supabase.from('bcps_audit_rounds').update({ wcm_submitted_at: now, wcm_submitted_by: ok.caller.email, findings_fixed: progress.done, findings_total: progress.total, updated_at: now }).eq('id', round.id)
  await supabase.from('bcps_departments').update({ audit_status: 'wcm_submitted', wcm_submitted_at: now, updated_at: now }).eq('id', body.department_id)
  const { data: busy } = await supabase.from('bcps_audit_queue').select('id').eq('department_id', body.department_id).in('status', ['queued', 'running']).limit(1).maybeSingle()
  if (!busy) await supabase.from('bcps_audit_queue').insert({ department_id: body.department_id, kind: 'site', run_month: now.slice(0, 7) + '-01', requested_by: ok.caller.email })
  return NextResponse.json({ ok: true, submitted: now })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { action?: string; department_id?: string; school_id?: string; url?: string; result_id?: string; check_id?: string; done?: boolean; note?: string; page_ids?: unknown; request_id?: string; outcome?: string; to_department_id?: string }
  if (body.action === 'add_page') return addPage(req, body)
  if (body.action === 'reclass') return reclassPages(req, body)
  if (body.action === 'reclass_withdraw') return withdrawReclass(req, body)
  if (body.action === 'reclass_resolve') return resolveReclass(req, body)
  if (body.action === 'mark') return markItem(req, body)
  if (body.action === 'submit') return submitFixes(req, body)
  const owner = { department_id: body.department_id ?? null, school_id: body.school_id ?? null }
  if (!owner.department_id && !owner.school_id) return NextResponse.json({ error: 'department_id or school_id required' }, { status: 400 })
  const ok = await access(req, owner)
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  // A school's audit can also be started by the people given the full-site
  // scan by name (Sean, 2026-10-23: the Schools tiles' Run audit now queues
  // this free audit instead of the WAVE page-by-page scan).
  const mayStart = ok.caller.admin || (!!owner.school_id && (await requireNamedPageGrant(req, 'ada-full-site-scan')).ok)
  if (!mayStart) return NextResponse.json({ error: 'Only the District Web Team can start a full-site audit.' }, { status: 403 })
  const col = owner.department_id ? 'department_id' : 'school_id'
  const { data: busy } = await supabase.from('bcps_audit_queue').select('id').eq(col, (owner.department_id ?? owner.school_id) as string).in('status', ['queued', 'running']).limit(1).maybeSingle()
  if (busy) return NextResponse.json({ ok: true, already: true })
  const { error } = await supabase.from('bcps_audit_queue').insert({ ...owner, kind: 'site', run_month: new Date().toISOString().slice(0, 7) + '-01', requested_by: ok.caller.email })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, queued: true })
}
