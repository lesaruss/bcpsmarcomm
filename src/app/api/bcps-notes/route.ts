import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
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
