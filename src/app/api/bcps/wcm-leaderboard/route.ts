import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const TOP = 20

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Department WCM leaderboard (Sean, 2026-11-03). Points for the current
// school year (August 1 to July 31); the scoring lives in public.bcps_wcm_leaderboard() and the
// point chart is the Leaderboard tab of the Department WCM Guide. Names are
// shown as first name and last initial, with the department, and only the
// top 20 are returned: everyone else sees their own rank and how far they
// are from the top 20. No email ever leaves this route.

interface Row {
  email: string
  name: string | null
  department: string | null
  cert_points: number
  hot_labs: number
  hotlab_points: number
  kickoff_points: number
  audit_points: number
  total: number
}

function schoolYearStart(now = new Date()): string {
  // The school year starts August 1 (Sean, 2026-11-03).
  const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${y}-08-01`
}

function maskName(full: string | null): string {
  const n = (full || '').trim()
  if (!n) return 'WCM'
  // Roster names are "First Last"; tolerate "Last, First".
  const parts = n.includes(',')
    ? n.split(',').map((s) => s.trim()).reverse().join(' ').split(/\s+/)
    : n.split(/\s+/)
  const first = parts[0]
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return last ? `${title(first)} ${last.charAt(0).toUpperCase()}.` : title(first)
}

function titleCase(s: string | null): string {
  return (s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bAnd\b/g, 'and')
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Missing session.' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })

  const email = (user.email || '').trim().toLowerCase()
  if (!email.endsWith('@browardschools.com')) {
    const { data: role } = await svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
    if (!role) return NextResponse.json({ error: 'Not available for this account.' }, { status: 403 })
  }

  const start = schoolYearStart()
  const [boardRes, summaryRes] = await Promise.all([
    svc.rpc('bcps_wcm_leaderboard', { p_start: start }),
    svc.rpc('bcps_wcm_leaderboard_summary', { p_start: start }),
  ])
  if (boardRes.error) return NextResponse.json({ error: boardRes.error.message }, { status: 500 })
  if (summaryRes.error) return NextResponse.json({ error: summaryRes.error.message }, { status: 500 })

  const rows = (boardRes.data ?? []) as Row[]
  const shape = (r: Row, i: number) => ({
    rank: i + 1,
    name: maskName(r.name),
    department: titleCase(r.department),
    total: r.total,
    certification: r.cert_points,
    hot_labs: r.hot_labs,
    hot_lab_points: r.hotlab_points,
    kickoff: r.kickoff_points,
    audit: r.audit_points,
  })

  const myIndex = rows.findIndex((r) => r.email === email)
  const cutoff = rows[TOP - 1]?.total ?? 0
  const me = myIndex < 0 ? null : {
    ...shape(rows[myIndex], myIndex),
    in_top: myIndex < TOP,
    // Points needed to match the 20th place score (ties go to whoever
    // certified first, so matching it is not a guarantee).
    points_to_top: myIndex < TOP ? 0 : Math.max(0, cutoff - rows[myIndex].total),
  }

  return NextResponse.json({
    ok: true,
    school_year: `${start.slice(0, 4)}-${String(Number(start.slice(0, 4)) + 1).slice(2)}`,
    total_ranked: rows.length,
    summary: summaryRes.data,
    board: rows.slice(0, TOP).map(shape),
    me,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
