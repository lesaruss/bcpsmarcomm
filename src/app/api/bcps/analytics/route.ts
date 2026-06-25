import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  try {
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

export async function POST() {
  try {
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
