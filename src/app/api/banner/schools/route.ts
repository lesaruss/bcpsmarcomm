import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// WCM Banner Submission App - School directory for the Explicit school
// selector.
//
// Why Explicit (a dropdown), not Implicit (derived from the signed-in WCM):
// confirmed with Vanessa Deslandes on the 2026-09-02 call that WCMs can be
// assigned to more than one school, so the submission can't infer which
// school a given upload is for from the logged-in user alone. Matches
// Vanessa's original Power Apps mockup, which also shows an explicit
// "Select School" field.
//
// Source of truth: bcps_school_directory, seeded 2026-09-03 from the
// SharePoint eAppsHub "2026_27 WCM Communications & Reports.xlsx" All
// Schools sheet (227 active schools; 2 known test rows - LocNo 9850, 9999 -
// excluded at seed time). Any signed-in bcpsmarcomm.com user may read this
// list - it has no sensitive fields, matching the open-submit posture of the
// rest of this widget.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

async function verifyCaller(token: string) {
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await svc
    .from('bcps_school_directory')
    .select('loc_no, school_name, school_level, region')
    .eq('is_archived', false)
    .order('school_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ schools: data ?? [] })
}
