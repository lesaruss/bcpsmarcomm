import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deptAccess, identifyCaller } from '@/lib/bcps-audit-auth'

// Full-site audit, read and queue (Sean, 2026-10-07).
//   GET  ?department_id= | ?school_id=      the site's pages, each with its
//        latest audit summary, every open issue across those pages (each
//        tagged with its page), plus queue progress
//   GET  ...&result_id=                     one page's full audit (checks,
//        screenshots, ADA results) for the viewer
//   POST { department_id | school_id }      queue a full-site audit (admins)
// Departments: admins, the department's WCM and its director may view.
// Schools: admins only for now.
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const FULL = 'id, department_id, school_id, site_page_id, run_id, audited_at, page_url, audit_version, overall_score, ada_score, checks, checks_passed, checks_failed, checks_review, screenshots, ada_violations, run_by'
const SUMMARY = 'id, site_page_id, run_id, audited_at, page_url, overall_score, ada_score, checks_passed, checks_failed, checks_review'

async function access(req: NextRequest, owner: { department_id?: string | null; school_id?: string | null }) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return { ok: false as const, status: caller.status }
  if (owner.school_id) return caller.admin ? { ok: true as const, caller, run: true } : { ok: false as const, status: 403 }
  const { data: dept } = await supabase.from('bcps_departments').select('id, wcm_email, director_email').eq('id', owner.department_id).maybeSingle()
  if (!dept) return { ok: false as const, status: 404 }
  const a = deptAccess(caller, dept)
  return a.view ? { ok: true as const, caller, run: a.run } : { ok: false as const, status: 403 }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const owner = { department_id: q.get('department_id'), school_id: q.get('school_id') }
  if (!owner.department_id && !owner.school_id) return NextResponse.json({ error: 'department_id or school_id required' }, { status: 400 })
  const ok = await access(req, owner)
  if (!ok.ok) return NextResponse.json({ error: 'Not allowed' }, { status: ok.status })
  const col = owner.department_id ? 'department_id' : 'school_id'
  const id = (owner.department_id ?? owner.school_id) as string

  const resultId = q.get('result_id')
  if (resultId) {
    const { data } = await supabase.from('bcps_audit_results').select(FULL).eq('id', resultId).eq(col, id).maybeSingle()
    return data ? NextResponse.json({ result: data }) : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [{ data: pages }, { data: results }, { data: queue }] = await Promise.all([
    supabase.from('bcps_site_pages').select('id, url, title, is_main, active').eq(col, id).eq('active', true).order('is_main', { ascending: false }).order('url'),
    supabase.from('bcps_audit_results').select(SUMMARY).eq(col, id).gte('audit_version', 3).order('audited_at', { ascending: false }).limit(300),
    supabase.from('bcps_audit_queue').select('status, kind').eq(col, id).in('status', ['queued', 'running']),
  ])
  // Latest result per page; the main page falls back to an audit from before
  // site runs existed (no site_page_id).
  const latest = new Map<string, NonNullable<typeof results>[number]>()
  for (const r of results ?? []) if (r.site_page_id && !latest.has(r.site_page_id)) latest.set(r.site_page_id, r)
  const legacyMain = (results ?? []).find((r) => !r.site_page_id)
  const list = (pages ?? []).map((p) => ({ ...p, result: latest.get(p.id) ?? (p.is_main ? legacyMain ?? null : null) }))
  if (!list.length && legacyMain) list.push({ id: 'main', url: legacyMain.page_url ?? '', title: null, is_main: true, active: true, result: legacyMain })
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
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { department_id?: string; school_id?: string }
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
