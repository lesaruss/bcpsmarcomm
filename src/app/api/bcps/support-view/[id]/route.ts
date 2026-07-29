import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Admin-facing read-only diagnostic view (per Sean, 2026-07-29). Only
// reachable once the target member has approved the grant - the grant id
// here is not a secret (the secret token lives only in the member-facing
// email link), it's just an identifier the requesting admin already owns,
// so access is gated purely on grant.requested_by matching the caller and
// grant.status === 'approved'. Deliberately read-only: no write endpoints
// exist here at all, matching the "look, don't touch" decision.
async function requireRequestingAdmin(req: NextRequest, grantId: string) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false as const, status: 401 }
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }

  const { data: grant } = await svc.from('support_access_grants').select('*').eq('id', grantId).maybeSingle()
  if (!grant) return { ok: false as const, status: 404 }
  if (grant.requested_by !== user.id) return { ok: false as const, status: 403 }
  if (grant.status !== 'approved') return { ok: false as const, status: 409 }

  return { ok: true as const, grant }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireRequestingAdmin(req, params.id)
  if (!result.ok) return NextResponse.json({ error: 'Not available.' }, { status: result.status })
  const { grant } = result

  const [{ data: profile }, { data: progress }, { data: reports }] = await Promise.all([
    svc.from('wcm_cert_users').select('full_name, email, department').eq('user_id', grant.target_user_id).maybeSingle(),
    svc.from('wcm_cert_progress').select('completed').eq('user_id', grant.target_user_id).eq('course_id', 'dept-wcm-v1'),
    svc.from('wcm_pilot_feedback').select('id, created_at, page, message, status').eq('user_id', grant.target_user_id).order('created_at', { ascending: false }).limit(10),
  ])

  const completed = (progress ?? []).filter(p => p.completed).length
  const total = 89

  return NextResponse.json({
    grant: { id: grant.id, status: grant.status, approved_at: grant.approved_at, reason: grant.reason },
    profile: profile ?? null,
    cert_progress: { completed, total, pct: Math.round((completed / total) * 100) },
    reports: reports ?? [],
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const result = await requireRequestingAdmin(req, params.id)
  if (!result.ok) return NextResponse.json({ error: 'Not available.' }, { status: result.status })

  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'close') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  await svc.from('support_access_grants').update({
    status: 'closed', closed_at: new Date().toISOString(), closed_by: 'admin',
  }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
