import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Public, read-only, non-sensitive: just the 143 department names + location
// numbers, alphabetical. Backs the searchable Department picker on the public
// WCM Roster signup form (/bcps/wcm-roster-signup) AND the WCM Department
// Registration form (/wcm-registration/register). No access key required -
// this is the same list that was in the retired Microsoft Form dropdown, and
// carries no director/WCM personal data.
//
// department_slug added 2026-08-19: bcps_wcm_roster.matched_department_id
// already links most rows (64/65) to their real bcps_departments row - this
// resolves that to a slug so registration can set acl_member_roles.department_slug
// directly instead of only writing a free-text department name to
// wcm_cert_users, which the Members directory never reads (BCPS-WCM-REG-NO-DEPT-SLUG).
export async function GET() {
  const { data, error } = await supabase
    .from('bcps_wcm_roster')
    .select('id, department_name, location_number, matched_department_id')
    .order('department_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const deptIds = Array.from(new Set((data ?? []).map(d => d.matched_department_id).filter(Boolean)))
  const slugById = new Map<string, string>()
  if (deptIds.length) {
    const { data: depts } = await supabase.from('bcps_departments').select('id, slug').in('id', deptIds)
    ;(depts ?? []).forEach(d => slugById.set(d.id, d.slug))
  }

  const departments = (data ?? []).map(d => ({
    id: d.id,
    department_name: d.department_name,
    location_number: d.location_number,
    department_slug: d.matched_department_id ? slugById.get(d.matched_department_id) ?? null : null,
  }))

  return NextResponse.json({ departments })
}
