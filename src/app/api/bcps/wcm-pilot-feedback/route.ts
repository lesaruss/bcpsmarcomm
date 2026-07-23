import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Stores WCM Pilot Program feedback (bugs, confusion, suggestions) submitted
// via the in-platform widget, replacing Teams/email per the July 16 Hot Lab
// request. Works whether the sender is logged in yet or not, since brand new
// registrants can hit trouble before they ever have an account.
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const message = (body?.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

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

  try {
    const { error } = await svc.from('wcm_pilot_feedback').insert({
      user_id: userId,
      email: userEmail || (body?.contact_email ? String(body.contact_email).trim() : null),
      page: body?.page || null,
      message,
    })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not save feedback.' }, { status: 500 })
  }
}
