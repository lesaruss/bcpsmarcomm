import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Public, read-only, non-sensitive: just the 143 department names + location
// numbers, alphabetical. Backs the searchable Department picker on the public
// WCM Roster signup form (/bcps/wcm-roster-signup). No access key required -
// this is the same list that was in the retired Microsoft Form dropdown, and
// carries no director/WCM personal data.
export async function GET() {
  const { data, error } = await supabase
    .from('bcps_wcm_roster')
    .select('id, department_name, location_number')
    .order('department_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ departments: data ?? [] })
}
