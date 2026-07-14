// src/app/api/bcps/pulse/route.ts
// Pulse widget backend. Identity comes ONLY from the signed-in session
// (cookies), never from client-supplied name/email fields. Admin
// submissions (wcm_cert_users.is_admin = true) auto-approve; everyone
// else's note lands as pending_approval for an admin to review via the
// Note Approvals queue (GET ?scope=queue, PATCH to approve/reject).

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { serviceClient } from '@/lib/supabase'

async function getSessionEmail(): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null

    const cookieStore = await cookies()
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  } catch {
    return null
  }
}

async function lookupIdentity(email: string) {
  const db = serviceClient()
  if (!db) return { name: email, isAdmin: false }
  const { data } = await db
    .from('wcm_cert_users')
    .select('full_name, is_admin')
    .ilike('email', email)
    .maybeSingle()
  return {
    name: data?.full_name || email,
    isAdmin: !!data?.is_admin,
  }
}

// GET: default -> tells the widget whether to render at all, and shows a
// read-only "signed in as" line instead of asking for name/email.
// GET ?scope=queue -> admin-only. Returns the review queue: every
// pending_approval message first, then recently resolved ones, so an
// admin can see what still needs action and what was just decided.
export async function GET(req: NextRequest) {
  const email = await getSessionEmail()
  if (!email) return NextResponse.json({ loggedIn: false })

  const { name, isAdmin } = await lookupIdentity(email)

  const scope = req.nextUrl.searchParams.get('scope')
  if (scope === 'queue') {
    if (!isAdmin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })
    const db = serviceClient()
    if (!db) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

    const { data, error } = await db
      .from('pulse_messages')
      .select('id, page_slug, page_url, brand_slug, message, sender_name, sender_email, status, is_admin_submission, created_at, resolved_at, resolved_by')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items = (data ?? []).sort((a, b) => {
      const aPending = a.status === 'pending_approval' ? 0 : 1
      const bPending = b.status === 'pending_approval' ? 0 : 1
      if (aPending !== bPending) return aPending - bPending
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

    return NextResponse.json({ items })
  }

  return NextResponse.json({ loggedIn: true, email, name, isAdmin })
}

// POST: submit a note. Requires an active session. Identity is taken
// from the session, never from the request body.
export async function POST(req: NextRequest) {
  const email = await getSessionEmail()
  if (!email) {
    return NextResponse.json({ error: 'You must be signed in to submit a note.' }, { status: 401 })
  }

  let body: { message?: string; page_slug?: string; page_url?: string; brand_slug?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const message = (body.message || '').trim()
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { name, isAdmin } = await lookupIdentity(email)
  const now = new Date().toISOString()

  const { error } = await db.from('pulse_messages').insert({
    page_slug: body.page_slug || null,
    page_url: body.page_url || null,
    brand_slug: body.brand_slug || 'bcps',
    message,
    sender_name: name,
    sender_email: email,
    status: isAdmin ? 'approved' : 'pending_approval',
    is_admin_submission: isAdmin,
    resolved_at: isAdmin ? now : null,
    resolved_by: isAdmin ? name : null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, status: isAdmin ? 'approved' : 'pending_approval' })
}

// PATCH: admin approves or rejects a pending note. { id, action: 'approve' | 'reject' }
export async function PATCH(req: NextRequest) {
  const email = await getSessionEmail()
  if (!email) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const { name, isAdmin } = await lookupIdentity(email)
  if (!isAdmin) return NextResponse.json({ error: 'Admin only.' }, { status: 403 })

  let body: { id?: string; action?: 'approve' | 'reject' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.id || !body.action) {
    return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  }

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Server not configured' }, { status: 500 })

  const { error } = await db
    .from('pulse_messages')
    .update({
      status: body.action === 'approve' ? 'approved' : 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: name,
    })
    .eq('id', body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
