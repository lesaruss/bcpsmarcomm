import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Thin wrapper around the Resend HTTP API (no SDK dependency needed).
// bcpsmarcomm.com is already a verified Resend sending domain (per the
// LESARUSS email infrastructure brief, 2026-07-16), so this sends straight
// from notifications@bcpsmarcomm.com rather than adding a new domain.
//
// Callers should never let a notification failure block the primary write
// (the report itself must save even if the email fails) - this function
// swallows its own errors and returns a result object instead of throwing,
// so callers can log the outcome onto the row they just wrote and stay
// verifiable without needing direct access to Resend's dashboard.
//
// DURABILITY, added 2026-09-15. Every message is written to
// bcps_outbound_emails with its full rendered body BEFORE the send is
// attempted, and the row is then marked sent or failed. The provider can go
// away - a lapsed subscription, a rate limit, an outage - without losing the
// message itself: a failed row still holds the exact recipient, subject and
// HTML, so it can be replayed later (POST /api/bcps/email-queue) or copied
// out by hand. Nothing here can block a send: if the log write fails, the
// email is still attempted.

let cachedDb: SupabaseClient | null = null
function db(): SupabaseClient | null {
  if (cachedDb) return cachedDb
  const url = process.env.LESARUSS_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.LESARUSS_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cachedDb = createClient(url, key, { auth: { persistSession: false } })
  return cachedDb
}

const asArray = (v: string | string[] | undefined): string[] | null =>
  v === undefined ? null : Array.isArray(v) ? v : [v]

export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  cc?: string | string[]
  // What this message is, so a queued row can be identified later without
  // reading the HTML (e.g. 'wcm-roster-approval-director').
  kind?: string
  context?: Record<string, unknown>
}): Promise<{ ok: boolean; error?: string; logged_id?: string }> {
  const to = asArray(opts.to)!
  const cc = asArray(opts.cc)

  // 1. Record it first, so the message survives whatever happens next.
  let rowId: string | null = null
  try {
    const client = db()
    if (client) {
      const { data } = await client.from('bcps_outbound_emails').insert({
        kind: opts.kind ?? null,
        to_addresses: to,
        cc_addresses: cc,
        reply_to: opts.replyTo ?? null,
        subject: opts.subject,
        html: opts.html,
        status: 'pending',
        context: opts.context ?? null,
      }).select('id').single()
      rowId = data?.id ?? null
    }
  } catch { /* logging must never block a send */ }

  const result = await deliver({ to, cc, subject: opts.subject, html: opts.html, replyTo: opts.replyTo })

  try {
    const client = db()
    if (client && rowId) {
      await client.from('bcps_outbound_emails').update({
        status: result.ok ? 'sent' : 'failed',
        attempts: 1,
        last_error: result.ok ? null : result.error ?? null,
        sent_at: result.ok ? new Date().toISOString() : null,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', rowId)
    }
  } catch { /* the send already happened; the log is best-effort */ }

  return { ...result, logged_id: rowId ?? undefined }
}

// The raw provider call, split out so the replay endpoint can retry a stored
// message without re-logging it as a new one.
export async function deliver(opts: {
  to: string[]
  cc?: string[] | null
  subject: string
  html: string
  replyTo?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BCPS Marcomm <notifications@bcpsmarcomm.com>',
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.cc && opts.cc.length ? { cc: opts.cc } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown email error' }
  }
}
