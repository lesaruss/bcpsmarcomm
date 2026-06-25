import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    // bcps_departments and studio_projects live in the main LESARUSS Supabase project
    const supabase = createClient(
      process.env.LESARUSS_SUPABASE_URL!,
      process.env.LESARUSS_SUPABASE_SERVICE_KEY!
    )

    const [deptRes, briefRes] = await Promise.all([
      supabase.from('bcps_departments').select('health_status, audit_status'),
      supabase
        .from('studio_projects')
        .select('id', { count: 'exact', head: true })
        .eq('brand_slug', 'bcps')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    const rows = deptRes.data ?? []
    return NextResponse.json({
      totalDepts: rows.length,
      healthy: rows.filter((d: { health_status: string }) => d.health_status === 'healthy').length,
      pendingAudits: rows.filter((d: { audit_status: string }) =>
        !d.audit_status ||
        d.audit_status === 'Incomplete' ||
        d.audit_status === 'not_started'
      ).length,
      recentBriefs: briefRes.count ?? 0,
    })
  } catch (err) {
    console.error('Pulse API error:', err)
    return NextResponse.json({ error: 'Failed to load pulse data' }, { status: 500 })
  }
}

