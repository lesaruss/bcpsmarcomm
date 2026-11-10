// POST /api/bcps/doc-unlock  { slug, password }
// Password access for one BCPS document (Sean, 2026-11-10). A correct password
// sets a signed, HttpOnly 24-hour pass cookie for that document only. Signing
// in stays the other way in. See src/lib/bcps-doc-password.ts.

import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/bcps-doc-access'
import {
  getDocPassword, verifyPassword, makePass, passCookieName,
  lockedMinutes, recordFailure, clearFailures,
} from '@/lib/bcps-doc-password'

export const dynamic = 'force-dynamic'

const WRONG = 'That password is not right. Check it and try again, or sign in.'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^[a-z0-9-]+$/.test(slug) || !password) {
    return NextResponse.json({ error: 'Enter the password for this document.' }, { status: 400 })
  }

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 })

  const row = await getDocPassword(db, slug)
  // Same answer whether or not the document has a password, so the endpoint
  // never confirms which documents exist.
  if (!row) return NextResponse.json({ error: WRONG }, { status: 401 })

  const locked = lockedMinutes(row)
  if (locked) {
    return NextResponse.json({ error: `Too many tries. Try again in ${locked} minute${locked === 1 ? '' : 's'}, or sign in.` }, { status: 429 })
  }

  if (!verifyPassword(password, row.password_hash)) {
    await recordFailure(db, row)
    return NextResponse.json({ error: WRONG }, { status: 401 })
  }

  const pass = makePass(slug, row.password_hash)
  if (!pass) return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 })
  if (row.failed_attempts) await clearFailures(db, slug)

  const res = NextResponse.json({ ok: true, expires: pass.expires.toISOString() })
  res.cookies.set(passCookieName(slug), pass.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: pass.expires,
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
