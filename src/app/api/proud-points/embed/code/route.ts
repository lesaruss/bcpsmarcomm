import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { svc, isDistrictEmail, hashCode } from '@/lib/proudPointsApi'
import { sendEmail } from '@/lib/resend'

// Embed sign-in, step 1: email a six-digit code to a @browardschools.com
// address. Only a hash is stored. Five codes an hour per address; a code
// lasts 15 minutes. The answer is the same whether or not the address gets a
// code, apart from the district-domain check, so the route does not reveal
// anything about who has used it.

const CODE_TTL_MIN = 15
const MAX_PER_HOUR = 5

export async function POST(req: NextRequest) {
  const { email: raw } = (await req.json().catch(() => ({}))) as { email?: string }
  const email = (raw || '').trim().toLowerCase()
  if (!isDistrictEmail(email)) {
    return NextResponse.json({ error: 'Use your @browardschools.com email address.' }, { status: 400 })
  }

  const hourAgo = new Date(Date.now() - 3600e3).toISOString()
  const { count } = await svc.from('bcps_proud_point_codes').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', hourAgo)
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ error: 'Too many codes requested. Please wait an hour and try again.' }, { status: 429 })
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const { error } = await svc.from('bcps_proud_point_codes').insert({
    email, code_hash: hashCode(email, code), expires_at: new Date(Date.now() + CODE_TTL_MIN * 60e3).toISOString(),
  })
  if (error) return NextResponse.json({ error: 'Could not send a code. Please try again.' }, { status: 500 })

  const sent = await sendEmail({
    to: email,
    subject: `Your Proud Points sign-in code: ${code}`,
    kind: 'proud-points-code',
    html: `
      <p>Hi,</p>
      <p>Your code to sign in to the School Proud Points form is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
      <p>It works for ${CODE_TTL_MIN} minutes. If you did not ask for it, you can ignore this email.</p>
      <p style="color:#888;font-size:12px">This is an automated message from the School Proud Points Submission Form.</p>`,
  })
  if (!sent.ok) return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  return NextResponse.json({ ok: true, minutes: CODE_TTL_MIN })
}
