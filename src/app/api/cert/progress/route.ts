import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller against their own Supabase session before writing
// progress under their user_id, matching the Authorization: Bearer <token>
// pattern already used across /api/bcps/* (e.g. my-profile, admin-decision).
// Before this fix, this route trusted whatever user_id the client sent in
// the request body with no check that it belonged to the caller (found
// during the full-course audit, Sean 2026-09-01).
async function verifyCaller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  try {
    const user = await verifyCaller(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json()
    const { user_id, course_id, module_id, page_id, completed, completed_at, submission_text } = body

    if (!course_id || !module_id || !page_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // The client still sends user_id (used elsewhere as a plain identifier);
    // cross-check it against the verified session rather than trusting it.
    if (user_id && user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const record: Record<string, unknown> = {
      user_id: user.id, course_id, module_id, page_id,
      last_visited_at: new Date().toISOString(),
    }
    if (completed) {
      record.completed = true
      record.completed_at = completed_at || new Date().toISOString()
    }
    if (typeof submission_text === 'string') {
      record.submission_text = submission_text
    }

    const { error } = await supabase
      .from('wcm_cert_progress')
      .upsert(record, { onConflict: 'user_id,course_id,module_id,page_id' })

    if (error) {
      console.error('Progress upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Progress API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
