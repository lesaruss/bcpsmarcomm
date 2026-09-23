import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsPageAccess, requireBcpsSuperAdmin } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// AUTH, added 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// Both handlers were unauthenticated.
//
// Widened 2026-09-22 from requireBcpsSuperAdmin to requireBcpsPageAccess:
// Sean granted the Office of Communications access to the Analytics page, and
// a superadmin-only data route would have handed them a nav item that 403s.
// The page's data is now gated by the same acl_objects/acl_grants rows that
// decide whether the page appears in their sidebar, so nav and data cannot
// disagree and access is a data change rather than a code change.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireBcpsPageAccess(req, 'analytics')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const prevFrom = searchParams.get('prevFrom')
    const prevTo = searchParams.get('prevTo')

    // Build snapshot query - filter by created_at range if period params provided
    let snapQuery = supabase
      .from('bcps_analytics_snapshots')
      .select('*')
      .order('created_at', { ascending: false })

    if (from && to) {
      snapQuery = snapQuery
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
    }

    const { data: snap } = await snapQuery.limit(1).maybeSingle()

    const { data: deptRows } = await supabase
      .from('bcps_departments')
      .select('slug, name, website_url')
      .not('website_url', 'is', null)

    // Fetch comparison period snapshot
    let prevSnap = null
    if (prevFrom && prevTo) {
      const { data } = await supabase
        .from('bcps_analytics_snapshots')
        .select('*')
        .gte('created_at', prevFrom)
        .lte('created_at', prevTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      prevSnap = data ?? null
    }

    return NextResponse.json({
      snapshot: snap ?? null,
      prevSnapshot: prevSnap,
      departments: deptRows ?? [],
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Sync (POST) had NO auth check at all until 2026-09-23 - anyone who found
// the URL could fire the bcps-ga4-sync edge function with the service key.
// Superadmin only, per Sean (Hot Lab 2026-09-17: "Only super admin should
// have the ability to sync"), while GET widened to analytics page grants.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireBcpsSuperAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = process.env.LESARUSS_SUPABASE_URL! + '/functions/v1/bcps-ga4-sync'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LESARUSS_SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
