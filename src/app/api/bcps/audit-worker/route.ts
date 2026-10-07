import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { runAndSaveDeptAudit } from '@/lib/dept-audit-run'

// Monthly department audit worker (Sean, 2026-10-07). pg_cron calls this
// every 4 minutes while bcps_audit_queue has work (see migration
// 20261007_bcps_audit_monthly.sql). Each call audits ONE department, the
// same way the Run Audit button does, so browardschools.com sees one page
// every few minutes instead of a burst. Callers prove themselves with the
// x-audit-key header, checked against lesaruss_secrets.BCPS_AUDIT_WORKER_KEY.
export const dynamic = 'force-dynamic'
export const maxDuration = 240

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)

// A department audited in the last week (a WCM re-check, an admin run) is
// skipped for the monthly pass.
const RECENT_DAYS = 7
const MAX_ATTEMPTS = 3

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: jobs, error: claimErr } = await supabase.rpc('bcps_claim_audit_job')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  const job = (jobs as { id: string; department_id: string; attempts: number }[] | null)?.[0]
  if (!job) return NextResponse.json({ ok: true, idle: true })

  const finish = (fields: Record<string, unknown>) =>
    supabase.from('bcps_audit_queue').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', job.id)

  try {
    const { data: dept } = await supabase.from('bcps_departments')
      .select('id, name, website_url, current_round').eq('id', job.department_id).maybeSingle()
    if (!dept?.website_url) { await finish({ status: 'skipped', last_error: 'no website address on file' }); return NextResponse.json({ ok: true, skipped: 'no url' }) }

    const since = new Date(Date.now() - RECENT_DAYS * 864e5).toISOString()
    const { data: recent } = await supabase.from('bcps_audit_results').select('id')
      .eq('department_id', dept.id).gte('audit_version', 3).gte('audited_at', since).limit(1).maybeSingle()
    if (recent) { await finish({ status: 'skipped', audit_result_id: recent.id, last_error: `audited in the last ${RECENT_DAYS} days` }); return NextResponse.json({ ok: true, skipped: 'recent' }) }

    const saved = await runAndSaveDeptAudit(supabase, { id: dept.id, name: dept.name, website_url: dept.website_url }, { runBy: null, roundNumber: dept.current_round ?? 1 })
    if (!saved.ok) throw new Error(saved.error || 'scan failed')
    await finish({ status: 'done', audit_result_id: saved.result.id, last_error: null })
    return NextResponse.json({ ok: true, department: dept.name, score: saved.out.score.score })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[audit-worker]', job.department_id, msg)
    // Back in the queue for another try, until the attempts run out.
    await supabase.from('bcps_audit_queue').update(job.attempts >= MAX_ATTEMPTS
      ? { status: 'failed', finished_at: new Date().toISOString(), last_error: msg.slice(0, 500) }
      : { status: 'queued', last_error: msg.slice(0, 500) }).eq('id', job.id)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
