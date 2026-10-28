import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookItemActor } from '@/lib/bcps-auth'
import { STREAMS, streamByKey, frequencies } from '@/lib/email-streams'
import { FREQUENCY_LABEL, type Frequency } from '@/lib/email-stream-copy'

// Email settings (Campaigns Phase 2, V 2026-10-28): every signed-in person
// chooses how often they get each recurring email (every weekday, weekly,
// every two weeks, monthly or off). The link is at the foot of every
// recurring email. See lib/email-streams.
//
//   GET  -> { email, frequencies: [{ key, label }], streams: [{ key, name, description, frequency }] }
//   POST { stream, frequency } -> { ok }
export const dynamic = 'force-dynamic'

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const FREQS = Object.keys(FREQUENCY_LABEL) as Frequency[]

export async function GET(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const email = auth.user.email.toLowerCase()
  const streams = await Promise.all(STREAMS.filter((s) => s.ready).map(async (s) => ({
    key: s.key, name: s.name, description: s.description, frequency: (await frequencies(svc, s, [email])).get(email),
  })))
  return NextResponse.json({ email, frequencies: FREQS.map((key) => ({ key, label: FREQUENCY_LABEL[key] })), streams })
}

export async function POST(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const stream = streamByKey(String(body.stream || ''))
  const frequency = FREQS.find((f) => f === body.frequency)
  if (!stream?.ready || !frequency) return NextResponse.json({ error: 'Pick an email and how often.' }, { status: 400 })
  const { error } = await svc.from('bcps_email_prefs').upsert({ email: auth.user.email.toLowerCase(), stream: stream.key, frequency, updated_at: new Date().toISOString() }, { onConflict: 'email,stream' })
  if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
