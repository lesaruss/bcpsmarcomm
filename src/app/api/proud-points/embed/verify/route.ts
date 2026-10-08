import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { svc, isDistrictEmail, hashCode, signEmbedToken, EMBED_TOKEN_DAYS } from '@/lib/proudPointsApi'

// Embed sign-in, step 2: trade the emailed code for a signed token the embed
// keeps for EMBED_TOKEN_DAYS days and sends as X-Proud-Points-Token. Five
// wrong tries end a code; a used code cannot be reused.

const MAX_ATTEMPTS = 5

export async function POST(req: NextRequest) {
  const { email: raw, code: rawCode } = (await req.json().catch(() => ({}))) as { email?: string; code?: string }
  const email = (raw || '').trim().toLowerCase()
  const code = (rawCode || '').replace(/\D/g, '')
  if (!isDistrictEmail(email) || code.length !== 6) {
    return NextResponse.json({ error: 'Enter the six-digit code from the email.' }, { status: 400 })
  }

  const { data: row } = await svc.from('bcps_proud_point_codes')
    .select('id, code_hash, attempts, expires_at, used_at')
    .eq('email', email).is('used_at', null).gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!row || row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'That code has expired. Ask for a new one.' }, { status: 400 })
  }

  const want = Buffer.from(row.code_hash, 'hex')
  const got = Buffer.from(hashCode(email, code), 'hex')
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    await svc.from('bcps_proud_point_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id)
    const left = MAX_ATTEMPTS - row.attempts - 1
    return NextResponse.json({ error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code has expired. Ask for a new one.' }, { status: 400 })
  }

  await svc.from('bcps_proud_point_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id)
  return NextResponse.json({ ok: true, token: signEmbedToken(email), email, days: EMBED_TOKEN_DAYS })
}
