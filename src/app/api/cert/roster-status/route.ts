import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rosterStatusForEmail, verifyCertCaller } from '@/lib/cert-roster'

export const dynamic = 'force-dynamic'

// The caller's own WCM Roster standing, for the Submit Badge Evidence page
// (Sean, 2026-11-04): a WCM who is on the roster does not have to upload a
// Composer screenshot, because new WCMs get Composer access only after they
// certify. Returns a status only, never roster rows. Same three values the
// Members page shows: confirmed | on_roster | unassigned.
export async function GET(req: NextRequest) {
  try {
    const user = await verifyCertCaller(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const status = await rosterStatusForEmail(svc, user.email)
    return NextResponse.json({ ok: true, status })
  } catch (err) {
    console.error('Roster-status error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
