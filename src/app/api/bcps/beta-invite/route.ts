import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Domains allowed to register / be invited (mirrors SuperAdmin domain allowlist).
const ALLOWED_DOMAINS = ['browardschools.com', 'lesaruss.com', 'lesaruss.ai']
const REDIRECT_TO = 'https://bcpsmarcomm.com/set-password'

function domainOf(email: string) {
  return (email.split('@')[1] || '').toLowerCase().trim()
}

// GET: list beta invites for the SuperAdmin panel.
export async function GET() {
  const { data, error } = await supabase
    .from('bcps_beta_invites')
    .select('id, name, email, role, status, beta')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, members: data ?? [] })
}

// POST: { action: 'invite' | 'resend' | 'revoke', ... }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = body.action as string

    if (action === 'invite') {
      const name = (body.name || '').trim()
      const email = (body.email || '').trim().toLowerCase()
      const role = (body.role || '').trim()
      if (!name || !email) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
      if (!ALLOWED_DOMAINS.includes(domainOf(email))) {
        return NextResponse.json({ error: `Email domain not allowed. Permitted: ${ALLOWED_DOMAINS.join(', ')}` }, { status: 422 })
      }

      // Send the real Supabase invite email (creates the auth user in invited state).
      const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: REDIRECT_TO,
        data: { name, role, beta: true },
      })
      if (inviteErr && !/already been registered|already registered|exists/i.test(inviteErr.message)) {
        return NextResponse.json({ error: inviteErr.message }, { status: 500 })
      }

      const { error: dbErr } = await supabase
        .from('bcps_beta_invites')
        .upsert({ name, email, role, status: 'sent', beta: true, invited_by: body.invited_by ?? 'superadmin' },
                { onConflict: 'email' })
      if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

      return NextResponse.json({ ok: true })
    }

    if (action === 'resend') {
      const email = (body.email || '').trim().toLowerCase()
      if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })
      // Re-send by generating a fresh invite/recovery link email.
      const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT_TO })
      if (error && !/already been registered|already registered|exists/i.test(error.message)) {
        // Fall back to a password-recovery email for already-registered users.
        const { error: recErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT_TO })
        if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'revoke') {
      const email = (body.email || '').trim().toLowerCase()
      const id = body.id
      const q = supabase.from('bcps_beta_invites').delete()
      const { error } = id != null ? await q.eq('id', id) : await q.eq('email', email)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
