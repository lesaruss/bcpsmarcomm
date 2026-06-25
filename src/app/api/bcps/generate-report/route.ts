'use server'

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(request: Request) {
  try {
    const { data: reports, error } = await supabase
      .from('bcps_reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return Response.json({ reports }, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching reports:', error)
    return Response.json(
      { error: error.message || 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}

// Violation categories that CAN be fixed in Finalsite
const FINALSITE_FIXABLE = new Set([
  'image-missing-alt',
  'button-name',
  'form-input-label',
  'table-header',
  'list-structure',
  'text-contrast',
])

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Query latest audit results per department
    const { data: audits, error: auditError } = await supabase
      .from('bcps_audit_results')
      .select(`
        id,
        department_id,
        department_name,
        violations,
        audit_date,
        bcps_departments(id, name)
      `)
      .order('audit_date', { ascending: false })

    if (auditError) throw auditError

    // Group by department, keeping only the latest
    const latestByDept = new Map()
    audits?.forEach((audit: any) => {
      const deptId = audit.department_id
      if (!latestByDept.has(deptId)) {
        latestByDept.set(deptId, audit)
      }
    })

    // Build departments array with Finalsite-fixable violations only
    const departments: any[] = []
    let totalFindings = 0
    const impactCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    }

    latestByDept.forEach((audit: any) => {
      const violations = audit.violations || []
      const fixable = violations.filter((v: any) => FINALSITE_FIXABLE.has(v.code))

      if (fixable.length > 0) {
        // Group by category
        const byCategory: Record<string, any[]> = {}
        fixable.forEach((v: any) => {
          const cat = v.code
          if (!byCategory[cat]) byCategory[cat] = []
          byCategory[cat].push(v)
        })

        const findings = Object.entries(byCategory).map(([code, items]) => ({
          code,
          count: items.length,
          severity: items[0].severity,
          pages: items.map((i: any) => i.page).slice(0, 5),
        }))

        totalFindings += fixable.length
        findings.forEach((f: any) => {
          impactCounts[f.severity] = (impactCounts[f.severity] || 0) + f.count
        })

        departments.push({
          id: audit.department_id,
          name: audit.department_name,
          auditDate: audit.audit_date,
          findingsCount: fixable.length,
          findings,
        })
      }
    })

    // Build summary
    const summary = {
      totalDepartments: departments.length,
      totalFindings,
      byImpact: impactCounts,
      generatedAt: new Date().toISOString(),
    }

    // Save to bcps_reports
    const { data: report, error: saveError } = await supabase
      .from('bcps_reports')
      .insert({
        title: `BCPS ADA Audit Report - ${new Date().toLocaleDateString()}`,
        summary,
        departments,
        status: 'generated',
      })
      .select()
      .single()

    if (saveError) throw saveError

    return Response.json({ report }, { status: 200 })
  } catch (error: any) {
    console.error('Report generation error:', error)
    return Response.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    )
  }
}
