import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// WCM Banner Submission App - "my submissions" list. Powers the dashboard
// widget's status view (pending/approved/rejected + rejection reason) and
// the Request Removal tab's "which upload do you mean" picker (only
// type='upload' rows the caller owns are eligible removal targets).

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

  const { data, error } = await svc.from('bcps_banner_submissions')
    .select('id, type, status, file_name, file_type, banner_title, banner_caption, alt_text, target_submission_id, requested_removal_date, removal_description, rejection_reason, submitted_at, reviewed_at')
    .eq('wcm_user_id', user.id)
    .order('submitted_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submissions: data ?? [] })
}
