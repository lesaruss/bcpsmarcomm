// app/api/bcps/member-dossier/route.ts
//
// GET /api/bcps/member-dossier?user_id=<id> - the "dossier" view V asked for
// 2026-08-19: "I should be able to click onto any of the member's profiles
// and see their activity... see which scans they've done, see what pages
// they've accepted, where they are on their certification, what
// certifications they have... a dossier on every single member, including
// myself."
//
// Any signed-in BCPS member may pull their OWN dossier. Pulling someone
// else's requires admin/superadmin - same server-side gate pattern as
// ada-scan/route.ts (never UI-only hiding, see the Celia Jimenez
// 2026-07-28 precedent noted there).
//
// Combines three already-separate data sources rather than inventing a new
// table:
//   - ADA scan history: bcps_audit_results.scanned_by_user_id (added
//     2026-08-19 alongside this feature)
//   - Certification progress/quiz history/issued certs: wcm_cert_progress,
//     wcm_cert_quiz_attempts, wcm_certifications (all already keyed by
//     user_id - pre-existing WCM Certification feature, untouched here)
//   - "Pages accepted": bcps_audit_findings rows marked wcm_fixed=true for
//     the member's assigned department, matched via
//     bcps_audit_rounds.wcm_submitted_by against the member's own email.
//     Findings are tracked per-department (not per-user) in the formal
//     audit pipeline, so this is the closest real signal for "what this
//     person, as that department's WCM, has gotten fixed/accepted" - not a
//     new column, just a join across existing tables.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function authedUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user ?? null
}

export async function GET(req: NextRequest) {
  const caller = await authedUser(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const targetUserId = req.nextUrl.searchParams.get('user_id') || caller.id

  const { data: callerRole } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', caller.id).eq('brand', BRAND).maybeSingle()
  const isPrivileged = callerRole?.role === 'admin' || callerRole?.role === 'superadmin'
  if (targetUserId !== caller.id && !isPrivileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: memberRole } = await svc.from('acl_member_roles')
    .select('user_id, department_slug, title')
    .eq('user_id', targetUserId).eq('brand', BRAND).maybeSingle()
  if (!memberRole) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  const { data: authUser } = await svc.auth.admin.getUserById(targetUserId)
  const memberEmail = authUser?.user?.email ?? null

  const [{ data: scans }, { data: certs }, { data: progress }, { data: quizzes }, { data: dept }] = await Promise.all([
    svc.from('bcps_audit_results')
      .select('id, page_url, ada_score, wave_score, status, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at')
      .eq('auditor', 'wcm-ada-scanner')
      .eq('scanned_by_user_id', targetUserId)
      .order('audited_at', { ascending: false })
      .limit(25),
    svc.from('wcm_certifications')
      .select('id, course_id, issued_at, expires_at')
      .eq('user_id', targetUserId)
      .order('issued_at', { ascending: false }),
    svc.from('wcm_cert_progress')
      .select('course_id, module_id, page_id, completed, completed_at, last_visited_at')
      .eq('user_id', targetUserId),
    svc.from('wcm_cert_quiz_attempts')
      .select('course_id, module_id, score, passed, attempted_at')
      .eq('user_id', targetUserId)
      .order('attempted_at', { ascending: false })
      .limit(10),
    memberRole.department_slug
      ? svc.from('bcps_departments').select('slug, name, division').eq('slug', memberRole.department_slug).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Certification progress, summarized per course (percent complete by
  // module-page completion count) rather than the raw per-page rows.
  const progressByCourse = new Map<string, { total: number; completed: number }>()
  for (const p of progress ?? []) {
    const c = progressByCourse.get(p.course_id) ?? { total: 0, completed: 0 }
    c.total++
    if (p.completed) c.completed++
    progressByCourse.set(p.course_id, c)
  }
  const certProgress = Array.from(progressByCourse.entries()).map(([course_id, v]) => ({
    course_id,
    pages_completed: v.completed,
    pages_total: v.total,
    pct: v.total ? Math.round((v.completed / v.total) * 100) : 0,
  }))

  // "Pages accepted" - findings marked fixed by this WCM (matched by email
  // against the audit round's wcm_submitted_by) that an admin subsequently
  // verified, for the department this member is currently assigned to.
  // Best-effort: bcps_audit_findings/rounds are department-scoped, not
  // user-scoped, in the existing schema.
  let pagesAccepted: { total_fixed: number; total_verified: number; rounds: unknown[] } = { total_fixed: 0, total_verified: 0, rounds: [] }
  if (memberRole.department_slug && dept) {
    const { data: deptRow } = await svc.from('bcps_departments').select('id').eq('slug', memberRole.department_slug).maybeSingle()
    if (deptRow) {
      const { data: rounds } = await svc.from('bcps_audit_rounds')
        .select('id, round_number, wcm_submitted_at, wcm_submitted_by, admin_reviewed_at, admin_decision, findings_total, findings_fixed, audit_passed')
        .eq('department_id', (deptRow as { id: string }).id)
        .order('round_number', { ascending: false })
      const mine = (rounds ?? []).filter(r =>
        !memberEmail || !r.wcm_submitted_by || r.wcm_submitted_by.toLowerCase().includes(memberEmail.toLowerCase())
      )
      const { data: findings } = await svc.from('bcps_audit_findings')
        .select('wcm_fixed, admin_verified')
        .eq('department_id', (deptRow as { id: string }).id)
      pagesAccepted = {
        total_fixed: (findings ?? []).filter(f => f.wcm_fixed).length,
        total_verified: (findings ?? []).filter(f => f.admin_verified).length,
        rounds: mine,
      }
    }
  }

  return NextResponse.json({
    ok: true,
    user_id: targetUserId,
    department: dept ?? null,
    title: memberRole.title ?? null,
    scans: scans ?? [],
    certifications: certs ?? [],
    cert_progress: certProgress,
    recent_quizzes: quizzes ?? [],
    pages_accepted: pagesAccepted,
  })
}
