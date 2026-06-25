import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// WCM submits their checklist after marking all findings fixed.
// Updates audit_status to wcm_submitted, stamps the round, notifies admin.
export async function POST(req: NextRequest) {
  try {
    const { department_id, wcm_email } = await req.json()
    if (!department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })

    // Verify all findings for this department+round are marked fixed
    const { data: dept } = await supabase
      .from('bcps_departments')
      .select('id, name, current_round, wcm_email')
      .eq('id', department_id)
      .single()

    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    // Security: confirm caller email matches wcm_email on record (or service key call)
    if (wcm_email && dept.wcm_email && wcm_email.toLowerCase() !== dept.wcm_email.toLowerCase()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: openFindings } = await supabase
      .from('bcps_audit_findings')
      .select('id')
      .eq('department_id', department_id)
      .eq('round_number', dept.current_round)
      .eq('wcm_fixed', false)

    if (openFindings && openFindings.length > 0) {
      return NextResponse.json({
        error: `${openFindings.length} finding(s) not yet marked fixed. Complete all items before submitting.`,
      }, { status: 422 })
    }

    const now = new Date().toISOString()

    // Update the audit round
    await supabase
      .from('bcps_audit_rounds')
      .update({
        wcm_submitted_at:   now,
        wcm_submitted_by:   wcm_email ?? dept.wcm_email,
        findings_fixed:     await getFixedCount(department_id, dept.current_round),
      })
      .eq('department_id', department_id)
      .eq('round_number', dept.current_round)

    // Update department status
    await supabase
      .from('bcps_departments')
      .update({
        audit_status:      'wcm_submitted',
        wcm_submitted_at:  now,
      })
      .eq('id', department_id)

    // Log to stream_events for admin notification
    await supabase
      .from('stream_events')
      .insert({
        timestamp:    now,
        owner:        'sar',
        station:      'SAR-station',
        task_id:      null,
        summary:      `[BCPS Audit] ${dept.name} WCM submitted Round ${dept.current_round} fixes for admin review.`,
        status:       'pending',
        context_link: `https://bcpsmarcomm.com/departments`,
      })

    return NextResponse.json({ success: true, round: dept.current_round })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function getFixedCount(department_id: string, round_number: number): Promise<number> {
  const { count } = await supabase
    .from('bcps_audit_findings')
    .select('id', { count: 'exact', head: true })
    .eq('department_id', department_id)
    .eq('round_number', round_number)
    .eq('wcm_fixed', true)
  return count ?? 0
}
