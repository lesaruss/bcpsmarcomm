import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsAdmin } from '@/lib/bcps-auth'
import { deliver } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// The outbound email queue. Every message the app sends is recorded in
// bcps_outbound_emails before delivery is attempted (see src/lib/resend.ts),
// so a provider failure is recoverable rather than a lost message.
//
// GET  - what failed, newest first, with the full body so a message can be
//        read or copied out by hand while the provider is unavailable.
// POST - replay failed messages once the provider works again. Retries in
//        order, stops at the first failure so a still-broken provider does
//        not burn the whole backlog, and reports exactly what it did.
//
// Admin only: these rows contain the recipients and full body of every
// notification, including one-time account links.

export async function GET(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const status = req.nextUrl.searchParams.get('status') ?? 'failed'
  const query = supabase.from('bcps_outbound_emails')
    .select('id, kind, to_addresses, subject, html, status, attempts, last_error, created_at, last_attempt_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data, error } = status === 'all' ? await query : await query.eq('status', status)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const res = NextResponse.json({ ok: true, count: data?.length ?? 0, emails: data ?? [] })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as { id?: string }

  const query = supabase.from('bcps_outbound_emails')
    .select('id, to_addresses, cc_addresses, reply_to, subject, html, attempts')
    .eq('status', 'failed')
    .order('created_at', { ascending: true })
    .limit(50)
  const { data: pending, error } = body.id ? await query.eq('id', body.id) : await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0
  let stoppedOn: string | null = null
  for (const row of pending ?? []) {
    const result = await deliver({
      to: row.to_addresses,
      cc: row.cc_addresses,
      subject: row.subject,
      html: row.html,
      replyTo: row.reply_to,
    })
    await supabase.from('bcps_outbound_emails').update({
      status: result.ok ? 'sent' : 'failed',
      attempts: (row.attempts ?? 0) + 1,
      last_error: result.ok ? null : result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
      last_attempt_at: new Date().toISOString(),
    }).eq('id', row.id)

    if (!result.ok) {
      // Still broken - stop rather than hammering a dead provider and
      // inflating the attempt count on every queued message.
      stoppedOn = result.error ?? 'Delivery failed'
      break
    }
    sent++
  }

  return NextResponse.json({
    ok: true,
    sent,
    remaining: Math.max((pending?.length ?? 0) - sent, 0),
    stopped_on: stoppedOn,
  })
}
