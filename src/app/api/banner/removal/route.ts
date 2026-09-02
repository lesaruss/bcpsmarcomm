import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// WCM Banner Submission App - Request Removal.
// WCM selects one of their OWN prior submissions and asks the District Web
// Team to take it down, giving a target removal date and a description
// identifying the file. Routes into the same review queue as uploads
// (bcps_banner_submissions, type='removal').

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

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { target_submission_id, requested_removal_date, removal_description } = body as {
    target_submission_id?: string; requested_removal_date?: string; removal_description?: string
  }

  if (!target_submission_id) return NextResponse.json({ error: 'target_submission_id is required' }, { status: 400 })
  if (!removal_description?.trim()) return NextResponse.json({ error: 'A description identifying the file is required' }, { status: 400 })

  // Must be one of the caller's own prior uploads.
  const { data: target } = await svc.from('bcps_banner_submissions')
    .select('id, wcm_user_id, type')
    .eq('id', target_submission_id)
    .maybeSingle()
  if (!target || target.wcm_user_id !== user.id || target.type !== 'upload') {
    return NextResponse.json({ error: 'That submission was not found on your account.' }, { status: 404 })
  }

  const { data: row, error } = await svc.from('bcps_banner_submissions').insert({
    wcm_user_id: user.id,
    wcm_email: user.email,
    type: 'removal',
    status: 'pending',
    target_submission_id,
    requested_removal_date: requested_removal_date || null,
    removal_description: removal_description.trim(),
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: row.id })
}
