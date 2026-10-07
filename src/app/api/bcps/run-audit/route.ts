import { NextRequest, NextResponse } from 'next/server'
import { runAndSavePageAudit } from '@/lib/dept-audit-run'
import { identifyCaller } from '@/lib/bcps-audit-auth'

// This route now launches headless Chromium for a real axe scan, so it needs
// the same budget its siblings already use (ada-scan, school-scan). Without
// it the default function timeout kills the scan mid-run.
export const dynamic = 'force-dynamic'
export const maxDuration = 240
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Who may run an audit: BCPS admins, and the department's own WCM (Sean,
// 2026-10-06: a WCM re-checks a page after fixing it, the way they resubmit
// a banner). Hot Lab 2026-07-28 found the button was only ever hidden in the
// UI, so the gate lives here.
// A WCM gets a few re-checks a day per department; admins are not limited.
const WCM_RUNS_PER_DAY = 3

// Department audit v3 (Sean, 2026-10-06): every check is a standard from the
// WCM Department Certification course (lib/dept-standards.ts), green, red or
// amber, pinned on screenshots of the page so the WCM sees exactly where
// each one is.
export async function POST(req: NextRequest) {
  try {
    const caller = await identifyCaller(req, supabase)
    if (!caller.ok) return NextResponse.json({ error: 'Sign in to run an audit.' }, { status: caller.status })

    const body = await req.json()
    // page_id (optional): re-check one page of the department's site; without
    // it the department's main page is audited.
    const { department_id, page_id, triggered_by = 'initial' } = body as { department_id: string; page_id?: string; triggered_by?: 'initial' | 'admin_reaudit' }
    if (!department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })

    const { data: dept, error: deptErr } = await supabase
      .from('bcps_departments')
      .select('id, name, website_url, current_round, wcm_email')
      .eq('id', department_id)
      .single()
    if (deptErr || !dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    const isDeptWcm = !!dept.wcm_email && dept.wcm_email.trim().toLowerCase() === caller.email
    if (!caller.admin && !isDeptWcm) return NextResponse.json({ error: 'Only this department’s WCM or the District Web Team can run this audit.' }, { status: 403 })
    if (!caller.admin) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { count } = await supabase.from('bcps_audit_results').select('id', { count: 'exact', head: true })
        .eq('department_id', dept.id).eq('run_by', caller.email).gte('audited_at', since)
      if ((count ?? 0) >= WCM_RUNS_PER_DAY) return NextResponse.json({ error: `You have run ${WCM_RUNS_PER_DAY} checks in the last 24 hours. Try again tomorrow, or ask the District Web Team.` }, { status: 429 })
    }

    if (!dept.website_url) return NextResponse.json({ error: 'This department has no website address on file to audit.' }, { status: 422 })
    const round_number = triggered_by === 'admin_reaudit' ? (dept.current_round ?? 1) : 1

    // Which page: a listed page of this department's site, or the main page.
    let page: { id: string; url: string; title: string | null; is_main: boolean } | null = null
    if (page_id) {
      const { data } = await supabase.from('bcps_site_pages').select('id, url, title, is_main, department_id, active').eq('id', page_id).maybeSingle()
      if (!data || data.department_id !== dept.id || !data.active) return NextResponse.json({ error: 'That page is not on this department\u2019s page list.' }, { status: 404 })
      page = data
    } else {
      const { data } = await supabase.from('bcps_site_pages').select('id, url, title, is_main').eq('department_id', dept.id).eq('is_main', true).maybeSingle()
      page = data ?? null
    }
    // A re-check joins the department's latest site run, so the site view
    // shows the fresh result for that page.
    const { data: lastRun } = await supabase.from('bcps_audit_results').select('run_id').eq('department_id', dept.id).not('run_id', 'is', null).order('audited_at', { ascending: false }).limit(1).maybeSingle()

    // No page or a failed scan is an honest error, never a generated score.
    const isMain = !page || page.is_main
    const saved = await runAndSavePageAudit(supabase, {
      departmentId: dept.id, name: dept.name, url: page && !page.is_main ? page.url : dept.website_url,
      mode: isMain ? 'dept-main' : 'dept-sub', sitePageId: page?.id ?? null, runId: lastRun?.run_id ?? null, pageTitle: page?.title ?? null,
    }, { runBy: caller.email, roundNumber: round_number })
    if (!saved.ok) return NextResponse.json({ error: 'The page could not be scanned. Try again in a minute.', detail: saved.error }, { status: 502 })
    const { result, findingsCount, out } = saved

    // Admin runs drive the review workflow; a WCM's own re-check does not.
    if (caller.admin && isMain) {
      await supabase.from('bcps_departments').update({
        audit_status:    triggered_by === 'admin_reaudit' ? 'admin_review' : 'wcm_notified',
        current_round:   round_number,
        wcm_notified_at: new Date().toISOString(),
      }).eq('id', dept.id)
    }

    return NextResponse.json({ result, round_number, findings_count: findingsCount, score: out.score, finalsite_owned: out.finalsite.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
