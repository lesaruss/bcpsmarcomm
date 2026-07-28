import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Admin-only endpoint (per Sean, Hot Lab 2026-07-28: a WCM, Celia Jimenez,
// had access to Run Audit on her own department profile - never
// server-enforced, only ever hidden/disabled in some UI. Real gate belongs
// here, not just in the client. This route decides pass/send-back on an
// audit, an even more sensitive admin action than triggering the audit
// itself, so it gets the same check.)
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const { createClient: createAnonClient } = await import('@supabase/supabase-js')
  const asUser = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await supabase.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403 }
  return { ok: true, email: user.email || '' }
}


// Admin makes a decision after reviewing re-audit results:
// decision = 'pass' -> audit_status = 'complete'
// decision = 'send_back' -> audit_status = 'needs_rework', increment round, notify WCM
export async function POST(req: NextRequest) {
  try {
    const auth = await requireBcpsAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: auth.status })

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

