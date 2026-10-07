import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID, timingSafeEqual } from 'crypto'
import { discoverDeptPages, runAndSavePageAudit } from '@/lib/dept-audit-run'

// Audit worker (Sean, 2026-10-07). pg_cron calls this every 4 minutes while
// bcps_audit_queue has work (migrations 20261007_bcps_audit_monthly and
// 20261007_bcps_site_audit). Two kinds of job:
//   site  find the site's pages (a department's left menu; a school's
//         homepage for now), save them to bcps_site_pages, and queue one
//         page job each under a new run_id
//   page  audit one page, the same way the Run Audit button does
// Jobs run one at a time, a few per call, so browardschools.com sees one
// page every few seconds at most. Callers prove themselves with the
// x-audit-key header, checked against lesaruss_secrets.BCPS_AUDIT_WORKER_KEY.
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)

const RECENT_DAYS = 7       // a monthly site pass skips a site audited this recently
const MAX_ATTEMPTS = 3
const BUDGET_MS = 150_000   // stop taking new jobs after this, well inside maxDuration
const MAX_JOBS = 4

type Job = { id: string; kind: 'site' | 'page'; department_id: string | null; school_id: string | null; site_page_id: string | null; run_id: string | null; run_month: string; attempts: number; requested_by: string | null }

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

const finish = (id: string, fields: Record<string, unknown>) =>
  supabase.from('bcps_audit_queue').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', id)

async function runSiteJob(job: Job): Promise<string> {
  const runId = randomUUID()
  let pages: { url: string; title: string; isMain: boolean }[] = []
  if (job.department_id) {
    const { data: dept } = await supabase.from('bcps_departments').select('id, name, website_url').eq('id', job.department_id).maybeSingle()
    if (!dept?.website_url) { await finish(job.id, { status: 'skipped', last_error: 'no website address on file' }); return 'skipped: no url' }
    if (!job.requested_by) {
      const since = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString()
      const { data: recent } = await supabase.from('bcps_audit_results').select('id').eq('department_id', dept.id).not('run_id', 'is', null).gte('audited_at', since).limit(1).maybeSingle()
      if (recent) { await finish(job.id, { status: 'skipped', last_error: `site audited in the last ${RECENT_DAYS} days` }); return 'skipped: recent' }
    }
    pages = await discoverDeptPages(dept.website_url)
    pages[0].title = pages[0].title || dept.name
  } else if (job.school_id) {
    const { data: school } = await supabase.from('bcps_schools').select('id, name, site_url').eq('id', job.school_id).maybeSingle()
    if (!school?.site_url) { await finish(job.id, { status: 'skipped', last_error: 'no website address on file' }); return 'skipped: no url' }
    // Schools: the homepage for now; more pages once the schools' scope is set.
    pages = [{ url: school.site_url.replace(/\/+$/, ''), title: `${school.name} homepage`, isMain: true }]
  }

  const owner = job.department_id ? { department_id: job.department_id } : { school_id: job.school_id }
  const queued: Record<string, unknown>[] = []
  for (const p of pages) {
    const { data: existing } = await supabase.from('bcps_site_pages').select('id, active')
      .match(owner).eq('url', p.url).maybeSingle()
    let pageId = existing?.id as string | undefined
    if (existing) {
      await supabase.from('bcps_site_pages').update({ last_seen_at: new Date().toISOString(), ...(p.title ? { title: p.title } : {}) }).eq('id', existing.id)
      if (!existing.active) continue
    } else {
      const { data: ins } = await supabase.from('bcps_site_pages')
        .insert({ ...owner, url: p.url, title: p.title || null, is_main: p.isMain, source: p.isMain ? 'main' : 'left_nav' })
        .select('id').single()
      pageId = ins?.id
    }
    if (pageId) queued.push({ ...owner, site_page_id: pageId, run_id: runId, run_month: job.run_month, kind: 'page', requested_by: job.requested_by ?? 'monthly' })
  }
  if (queued.length) await supabase.from('bcps_audit_queue').insert(queued)
  await finish(job.id, { status: 'done', run_id: runId, last_error: null })
  return `site: ${queued.length} pages queued`
}

async function runPageJob(job: Job): Promise<string> {
  const { data: page } = await supabase.from('bcps_site_pages').select('id, url, title, is_main, department_id, school_id').eq('id', job.site_page_id).maybeSingle()
  if (!page) { await finish(job.id, { status: 'skipped', last_error: 'page no longer on the list' }); return 'skipped: page gone' }
  let name = page.title || page.url
  let roundNumber = 1
  if (page.department_id) {
    const { data: dept } = await supabase.from('bcps_departments').select('name, current_round').eq('id', page.department_id).maybeSingle()
    name = dept?.name ?? name
    roundNumber = dept?.current_round ?? 1
  } else if (page.school_id) {
    const { data: school } = await supabase.from('bcps_schools').select('name').eq('id', page.school_id).maybeSingle()
    name = school?.name ?? name
  }
  const saved = await runAndSavePageAudit(supabase, {
    departmentId: page.department_id, schoolId: page.school_id, name, url: page.url,
    mode: page.school_id ? 'school-ada' : page.is_main ? 'dept-main' : 'dept-sub',
    sitePageId: page.id, runId: job.run_id, pageTitle: page.title,
  }, { runBy: null, roundNumber })
  if (!saved.ok) throw new Error(saved.error || 'scan failed')
  await finish(job.id, { status: 'done', audit_result_id: saved.result.id, last_error: null })
  return `page ${page.url}: ${saved.out.score.score}`
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const t0 = Date.now()
  const done: string[] = []
  for (let i = 0; i < MAX_JOBS && Date.now() - t0 < BUDGET_MS; i++) {
    const { data: jobs, error: claimErr } = await supabase.rpc('bcps_claim_audit_job')
    if (claimErr) return NextResponse.json({ error: claimErr.message, done }, { status: 500 })
    const job = (jobs as Job[] | null)?.[0]
    if (!job) break
    try {
      done.push(job.kind === 'site' ? await runSiteJob(job) : await runPageJob(job))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[audit-worker]', job.kind, job.id, msg)
      await supabase.from('bcps_audit_queue').update(job.attempts >= MAX_ATTEMPTS
        ? { status: 'failed', finished_at: new Date().toISOString(), last_error: msg.slice(0, 500) }
        : { status: 'queued', last_error: msg.slice(0, 500) }).eq('id', job.id)
      done.push(`error: ${msg.slice(0, 120)}`)
      break // leave the retry for the next tick instead of hammering the same page
    }
  }
  return NextResponse.json({ ok: true, done, idle: done.length === 0 })
}
