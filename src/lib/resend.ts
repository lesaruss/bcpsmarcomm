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
export async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
  replyTo?: string
  cc?: string | string[]
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
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.cc ? { cc: Array.isArray(opts.cc) ? opts.cc : [opts.cc] } : {}),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Unknown email error' }
  }
}
