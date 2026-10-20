import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Calendar posts (Sean, 2026-10-20): the Calendar Post Requests, from the form
// on its own and from MarComm requests, for the Office of Communications to
// post. Gated on the same 'marcomm-assignments' page grant as the tracker.
//   GET                                   every request, upcoming first
//   POST { id, status, posted_url?, note? }  new | posted | declined
const PAGE = 'marcomm-assignments'
const STATUSES = ['new', 'posted', 'declined']

export async function GET(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await supabase.from('bcps_calendar_requests')
    .select('*, bcps_marcomm_requests(job_number, title)').order('event_date', { ascending: true }).limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const res = NextResponse.json({ ok: true, requests: data ?? [] })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({})) as { id?: string; status?: string; posted_url?: string; note?: string }
  if (!body.id || !STATUSES.includes(body.status ?? '')) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  const url = (body.posted_url ?? '').trim()
  if (url && !/^https:\/\//i.test(url)) return NextResponse.json({ error: 'Links must start with https://' }, { status: 400 })
  const { error } = await supabase.from('bcps_calendar_requests').update({
    status: body.status, posted_url: body.status === 'posted' ? url || null : null,
    status_note: (body.note ?? '').trim().slice(0, 2000) || null,
    status_by: body.status === 'new' ? null : auth.user.email, status_at: body.status === 'new' ? null : new Date().toISOString(),
  }).eq('id', body.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
