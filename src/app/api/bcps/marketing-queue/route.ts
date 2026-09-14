import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsAdmin } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AUTH, rewritten 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, second pass).
// The previous comment here said it plainly: "Shared prototype access token for
// the specialist queue. Possession of the share link grants access. Replace with
// real specialist auth before live school data." That is now done, before any
// live school data arrived - bcps_marketing_submissions is still empty, so this
// is being closed while the cost of closing it is zero.
//
// Gated on requireBcpsAdmin rather than requireDistrictUser (which is what
// ooc-queue and dcr use). Those two back pages every signed-in member can
// already open, so district-level matches the check that guards them. This one
// has NO page in the app's nav to inherit a check from, and the rows it will
// hold are school-submitted contact details, so it takes the stronger gate.
// NOTE FOR SEAN: if the actual marketing specialists are not BCPS admins, this
// is the line to relax to requireDistrictUser - flagged rather than guessed,
// since nobody is using the tool yet to tell us either way.

// GET: list submissions for the specialist queue.
export async function GET(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
    const auth = await requireBcpsAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const { id, status, assigned_specialist, specialist_notes } = body
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
