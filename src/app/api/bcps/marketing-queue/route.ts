import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared prototype access token for the specialist queue. Possession of the
// share link grants access. Replace with real specialist auth before live school data.
const ACCESS_KEY = 'lr-mkt-spec-7f3a9c21'

// GET: list submissions for the specialist queue.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bcps_marketing_submissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, submissions: data ?? [] })
}

// POST: specialist updates status / assignment / notes on a submission.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, id, status, assigned_specialist, specialist_notes } = body
    if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (status !== undefined) update.status = status
    if (assigned_specialist !== undefined) update.assigned_specialist = assigned_specialist
    if (specialist_notes !== undefined) update.specialist_notes = specialist_notes

    const { error } = await supabase
      .from('bcps_marketing_submissions')
      .update(update)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
