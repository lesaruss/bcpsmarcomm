import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Stores site-wide "report an issue" submissions (bugs, confusion,
// suggestions) from the SiteFeedback widget, replacing Teams/email per
// the July 16 Hot Lab request. Originally WCM-pilot/cert-only; the
// widget now mounts on every bcpsmarcomm.com page (per V, 2026-07-29),
// so this route is the general intake for the whole site. Table name
// (wcm_pilot_feedback) kept as-is to avoid a migration; it now holds
// general site reports, not just WCM pilot ones.
//
// Identity precedence: normally we trust the signed-in session's email
// over anything the client sends. If the client flags not_me (the
// widget's "This isn't me" toggle), that means the signed-in account is
// wrong for this report, so a manually entered contact_email takes
// priority instead.
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const message = (body?.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const notMe = !!body?.not_me
  const contactEmail = body?.contact_email ? String(body.contact_email).trim() : null

  let userId: string | null = null
  let userEmail: string | null = null
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const asUser = createClient(URL, ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      })
      const { data: { user } } = await asUser.auth.getUser()
      if (user) {
        userId = user.id
        userEmail = user.email ?? null
      }
    } catch {
      /* treat as anonymous feedback */
    }
  }

  const emailToStore = notMe
    ? (contactEmail || userEmail)
    : (userEmail || contactEmail)

  try {
    const { error } = await svc.from('wcm_pilot_feedback').insert({
      user_id: notMe ? null : userId,
      email: emailToStore,
      page: body?.page || null,
      message,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not save feedback.' }, { status: 500 })
  }
}
