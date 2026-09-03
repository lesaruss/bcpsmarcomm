import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// School Profile - step one of the per-school profile model Sean asked for
// 2026-09-03 ("similar to departments... only tracking the banner for now,
// then the ADA can get a slot"). Banners-only for now; ADA joins later once
// bcps_audit_results is backfilled with school_location_nbr (it's keyed to
// the small bcps_schools pilot table today, not the 227-school
// bcps_school_directory this route uses - see BannerWidget.tsx history for
// why those are two different tables).
//
// Access: District Web Team only (same bcps_banner_admins admin/manager
// gate as the Review Queue). Per-school access for individual WCMs is a
// later, separate rollout - not this route.
//
// Retention model, per Sean 2026-09-03: nothing is ever hard-deleted.
// "Delete" from a DWT reviewer's point of view sets archived_at (soft
// delete) - the row stays in the table always. A submission marked
// is_test cannot be archived at all, so a test run can never be made to
// disappear from the audit trail; it can only be marked back to not-a-test
// before it's archived like anything else.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

async function requireBannerReviewer(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false as const, status: 401 }
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: row } = await svc.from('bcps_banner_admins')
    .select('role').eq('user_id', user.id).maybeSingle()
  if (!row) return { ok: false as const, status: 403 }
  return { ok: true as const, user, role: row.role as 'admin' | 'manager' }
}

// GET /api/banner/school-profile?loc_no=1234[&include_archived=1]
// Returns the school's directory record plus its banner submission history
// (module 1 of the profile). ADA history is not included yet - see header.
export async function GET(req: NextRequest) {
  const auth = await requireBannerReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const locNo = req.nextUrl.searchParams.get('loc_no')?.trim()
  if (!locNo) return NextResponse.json({ error: 'loc_no is required' }, { status: 400 })
  const includeArchived = req.nextUrl.searchParams.get('include_archived') === '1'

  const { data: school, error: schoolErr } = await svc
    .from('bcps_school_directory')
    .select('loc_no, school_name, school_level, region')
    .eq('loc_no', locNo)
    .maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'School not recognized.' }, { status: 404 })

  let query = svc.from('bcps_banner_submissions')
    .select('*')
    .eq('school_location_nbr', locNo)
    .order('submitted_at', { ascending: false })
  if (!includeArchived) query = query.is('archived_at', null)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const submissions = await Promise.all((rows ?? []).map(async (row) => {
    if (row.type === 'upload' && row.file_path) {
      const { data: signed } = await svc.storage.from('bcps-client').createSignedUrl(row.file_path, 60 * 30)
      return { ...row, signed_url: signed?.signedUrl ?? null }
    }
    return { ...row, signed_url: null }
  }))

  const active = submissions.filter(s => !s.archived_at)
  const summary = {
    total: active.length,
    pending: active.filter(s => s.status === 'pending').length,
    approved: active.filter(s => s.status === 'approved').length,
    rejected: active.filter(s => s.status === 'rejected').length,
    test_runs: active.filter(s => s.is_test).length,
  }

  return NextResponse.json({ school, submissions, summary, my_role: auth.role })
}

// POST /api/banner/school-profile
// body: { id, action: 'archive' | 'unarchive' | 'mark_test' | 'unmark_test' }
export async function POST(req: NextRequest) {
  const auth = await requireBannerReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: 'archive' | 'unarchive' | 'mark_test' | 'unmark_test' }
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  const { data: row, error: findErr } = await svc.from('bcps_banner_submissions').select('id, is_test, archived_at').eq('id', id).maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {}

  if (action === 'archive') {
    if (row.is_test) {
      return NextResponse.json({ error: 'Test runs cannot be archived - unmark it as a test first if it needs to come off the active list, or leave it as-is. This keeps the audit trail from being scrubbed.' }, { status: 400 })
    }
    update.archived_at = now
    update.archived_by = auth.user.id
    update.archived_by_email = auth.user.email
  } else if (action === 'unarchive') {
    update.archived_at = null
    update.archived_by = null
    update.archived_by_email = null
  } else if (action === 'mark_test') {
    update.is_test = true
    update.marked_test_by = auth.user.id
    update.marked_test_by_email = auth.user.email
  } else if (action === 'unmark_test') {
    update.is_test = false
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await svc.from('bcps_banner_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
