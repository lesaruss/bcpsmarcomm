import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

// AUTH, added 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// Aggregate counts only, no PII, but it was still handing out the District's
// department-health picture to anonymous callers. Its only caller is
// PulseWidget, which renders inside BCPSShell - i.e. only ever for a signed-in
// user - so requireDistrictUser matches where it is actually used.
export async function GET(req: NextRequest) {
  try {
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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

