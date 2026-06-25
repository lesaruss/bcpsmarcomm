import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// School submits its marketing intake. Stores answers + generated plan,
// then notifies the MarComm team via stream_events. Public route (no auth) for the prototype.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { school_name, contact_name, contact_email, answers, generated_plan } = body
    if (!school_name) {
      return NextResponse.json({ error: 'school_name required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('bcps_marketing_submissions')
      .insert({
        school_name,
        contact_name: contact_name ?? null,
        contact_email: contact_email ?? null,
        answers: answers ?? {},
        generated_plan: generated_plan ?? {},
        status: 'submitted',
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    try {
      await supabase.from('stream_events').insert({
        timestamp: new Date().toISOString(),
        owner: 'sar',
        station: 'SAR-station',
        task_id: null,
        summary: `[BCPS Marketing Guide] ${school_name} submitted a marketing plan for specialist review.`,
        status: 'in_progress',
        context_link: 'https://bcpsmarcomm.com/marketing-specialist.html',
      })
    } catch {}

    return NextResponse.json({ ok: true, id: data?.id })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
