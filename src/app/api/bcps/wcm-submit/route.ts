import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isBcpsAdmin } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// WCM submits their checklist after marking all findings fixed.
// Updates audit_status to wcm_submitted, stamps the round, notifies admin.
// AUTH, rewritten 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// This route DID carry an ownership check, but it was bypassable in two ways:
// the wcm_email it compared came from the request body rather than a session,
// and the comparison was written `if (wcm_email && dept.wcm_email && ...)`, so
// simply omitting wcm_email skipped the check entirely and let an
// unauthenticated caller mark any department's audit as submitted.
//
// The caller identity now comes from the session (the WCM is already signed in
// to reach /wcm-portal), and the check no longer has an opt-out path. A BCPS
// admin may still submit on a department's behalf.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { department_id } = await req.json()
    if (!department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })

    // Verify all findings for this department+round are marked fixed
    const { data: dept } = await supabase
      .from('bcps_departments')
      .select('id, name, current_round, wcm_email')
      .eq('id', department_id)
      .single()

    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    // Ownership: the signed-in caller must be the WCM of record for this
    // department, or a BCPS admin. No branch here can be skipped by omitting a
    // field - a department with no wcm_email on file is admin-only, not open.
    const callerEmail = auth.user.email
    const onFileWcm = (dept.wcm_email || '').trim().toLowerCase()
    const isOwner = !!onFileWcm && onFileWcm === callerEmail
    if (!isOwner && !(await isBcpsAdmin(auth.user.userId))) {
      return NextResponse.json(
        { error: 'Only this department\'s Web Content Manager can submit its checklist.' },
        { status: 403 }
      )
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
        // Recorded from the verified session, so the audit trail names who
        // actually submitted rather than whoever the request body claimed.
        wcm_submitted_by:   callerEmail || dept.wcm_email,
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
