import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

// AUTH, added 2026-09-15 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, third pass).
// Returned every internal assignment note, with author names, to anonymous
// callers. Worth flagging for Sean: this endpoint has NO caller anywhere in
// src/ or public/ - it looks dead. Gated rather than deleted, because an
// external consumer cannot be ruled out from inside the repo; if it really is
// unused it should be removed outright.
export async function GET(req: NextRequest) {
  const auth = await requireDistrictUser(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // Uses the main LESARUSS Supabase project where bcps_assignment_notes lives
  const supabase = createClient(
    process.env.LESARUSS_SUPABASE_URL!,
    process.env.LESARUSS_SUPABASE_SERVICE_KEY!
  )

  const { data, error } = await supabase
    .from('bcps_assignment_notes')
    .select('id, assignment_slug, note_text, author, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('bcps-notes fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
