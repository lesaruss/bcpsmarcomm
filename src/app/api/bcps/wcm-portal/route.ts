import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identifyCaller, isDeptWcm, wcmDepartmentIds } from '@/lib/bcps-audit-auth'

// WCM Audit Portal data (Sean, 2026-10-13). /wcm-portal used to read
// bcps_departments and bcps_audit_findings from the browser, matched on the
// single bcps_departments.wcm_email; bcps_audit_findings has row security on
// and no policies, so the browser saw no findings and "mark fixed" changed
// nothing. Both now run here, gated on lib/bcps-audit-auth isDeptWcm (the
// department's WCM roster), the same check run-audit and wcm-submit use.
//   GET  [?department_id=]   my departments, and the chosen one's findings
//                            for its current round (first department by default)
//   POST { finding_id }      mark one finding fixed
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const DEPT = 'id, name, wcm_name, wcm_email, audit_status, current_round, wcm_notified_at, wcm_submitted_at'

export async function GET(req: NextRequest) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in.' }, { status: caller.status })
  const ids = await wcmDepartmentIds(supabase, caller.email)
  if (!ids.length) return NextResponse.json({ departments: [], department: null, findings: [] })
  const { data: depts } = await supabase.from('bcps_departments').select(DEPT).in('id', ids).order('name')
  const list = depts ?? []
  const wanted = req.nextUrl.searchParams.get('department_id')
  const dept = list.find((d) => d.id === wanted) ?? list[0] ?? null
  if (!dept) return NextResponse.json({ departments: [], department: null, findings: [] })
  const { data: findings } = await supabase.from('bcps_audit_findings')
    .select('id, category, severity, finding_text, recommendation, wcm_fixed, wcm_fixed_at, carry_forward')
    .eq('department_id', dept.id).eq('round_number', dept.current_round ?? 1)
  return NextResponse.json({ departments: list.map((d) => ({ id: d.id, name: d.name })), department: dept, findings: findings ?? [] })
}

export async function POST(req: NextRequest) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in.' }, { status: caller.status })
  const { finding_id } = await req.json().catch(() => ({})) as { finding_id?: string }
  if (!finding_id) return NextResponse.json({ error: 'finding_id required' }, { status: 400 })
  const { data: finding } = await supabase.from('bcps_audit_findings').select('id, department_id').eq('id', finding_id).maybeSingle()
  if (!finding?.department_id) return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
  const { data: dept } = await supabase.from('bcps_departments').select('id, wcm_email').eq('id', finding.department_id).maybeSingle()
  if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  if (!caller.admin && !(await isDeptWcm(supabase, caller.email, dept))) {
    return NextResponse.json({ error: 'Only this department’s WCM can mark its findings fixed.' }, { status: 403 })
  }
  const wcm_fixed_at = new Date().toISOString()
  const { error } = await supabase.from('bcps_audit_findings').update({ wcm_fixed: true, wcm_fixed_at }).eq('id', finding.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, wcm_fixed_at })
}
