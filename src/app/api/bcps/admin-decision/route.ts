import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin makes a decision after reviewing re-audit results:
// decision = 'pass' -> audit_status = 'complete'
// decision = 'send_back' -> audit_status = 'needs_rework', increment round, notify WCM
export async function POST(req: NextRequest) {
  try {
    const { department_id, decision, admin_notes, admin_email } = await req.json() as {
      department_id: string
      decision: 'pass' | 'send_back'
      admin_notes?: string
      admin_email?: string
    }

    if (!department_id || !decision) {
      return NextResponse.json({ error: 'department_id and decision required' }, { status: 400 })
    }

    const { data: dept } = await supabase
      .from('bcps_departments')
      .select('id, name, current_round, wcm_email, wcm_name')
      .eq('id', department_id)
      .single()

    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    const now = new Date().toISOString()
    const newRound = decision === 'send_back' ? dept.current_round + 1 : dept.current_round

    // Update the current audit round with admin decision
    await supabase
      .from('bcps_audit_rounds')
      .update({
        admin_reviewed_at:  now,
        admin_reviewed_by:  admin_email ?? 'admin',
        admin_decision:     decision,
        admin_notes:        admin_notes ?? null,
        audit_passed:       decision === 'pass',
      })
      .eq('department_id', department_id)
      .eq('round_number', dept.current_round)

    if (decision === 'pass') {
      // Mark all findings as admin_verified
      await supabase
        .from('bcps_audit_findings')
        .update({ admin_verified: true, admin_verified_at: now })
        .eq('department_id', department_id)
        .eq('round_number', dept.current_round)

      await supabase
        .from('bcps_departments')
        .update({
          audit_status:          'complete',
          last_admin_review_at:  now,
          audit_completed_at:    now,
        })
        .eq('id', department_id)

      // Log completion
      await supabase.from('stream_events').insert({
        timestamp:    now,
        owner:        'sar',
        station:      'SAR-station',
        task_id:      null,
        summary:      `[BCPS Audit] ${dept.name} audit PASSED and marked complete by admin. Round ${dept.current_round}.`,
        status:       'complete',
        context_link: 'https://bcpsmarcomm.com/departments',
      })
    } else {
      // Send back: carry forward unfixed findings into next round, increment round
      const { data: unfixedFindings } = await supabase
        .from('bcps_audit_findings')
        .select('*')
        .eq('department_id', department_id)
        .eq('round_number', dept.current_round)
        .eq('wcm_fixed', false)

      // Carry unfixed findings forward into new round
      if (unfixedFindings && unfixedFindings.length > 0) {
        const carried = unfixedFindings.map(f => ({
          audit_result_id:  f.audit_result_id,
          department_id:    f.department_id,
          round_number:     newRound,
          category:         f.category,
          severity:         f.severity,
          finding_text:     f.finding_text,
          recommendation:   f.recommendation,
          wcm_fixed:        false,
          wcm_fixed_at:     null,
          admin_verified:   false,
          carry_forward:    true,
        }))
        await supabase.from('bcps_audit_findings').insert(carried)
      }

      await supabase
        .from('bcps_departments')
        .update({
          audit_status:          'needs_rework',
          last_admin_review_at:  now,
          current_round:         newRound,
          wcm_submitted_at:      null, // reset for next submission
        })
        .eq('id', department_id)

      // Log send-back with admin notes for WCM visibility
      await supabase.from('stream_events').insert({
        timestamp:    now,
        owner:        'sar',
        station:      'SAR-station',
        task_id:      null,
        summary:      `[BCPS Audit] ${dept.name} sent back to WCM for Round ${newRound}. ${unfixedFindings?.length ?? 0} item(s) still need work. Notes: ${admin_notes ?? 'See findings checklist.'}`,
        status:       'pending',
        context_link: 'https://bcpsmarcomm.com/departments',
      })
    }

    return NextResponse.json({ success: true, decision, new_round: newRound })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
