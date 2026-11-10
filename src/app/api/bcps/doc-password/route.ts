// /api/bcps/doc-password (Sean, 2026-11-10): the Password button on an open
// guide, Playbook or doc. Admins only, the same check as the Documents Access
// panel. GET ?slug= says whether that page takes a password and whether one is
// on (never the password itself); POST { slug, password | null } sets or
// removes it. Shares setDocPassword with the Access panel.

import { NextRequest, NextResponse } from 'next/server'
import { requireBcpsAdmin } from '@/lib/bcps-auth'
import { serviceClient } from '@/lib/bcps-doc-access'
import { passwordable, passwordSetAt, setDocPassword } from '@/lib/bcps-doc-password'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ allowed: false }, { headers: { 'Cache-Control': 'no-store' } })
  const db = serviceClient()
  const slug = (req.nextUrl.searchParams.get('slug') || '').trim().toLowerCase()
  if (!db || !(await passwordable(db, slug))) return NextResponse.json({ allowed: false }, { headers: { 'Cache-Control': 'no-store' } })
  return NextResponse.json({ allowed: true, set_at: await passwordSetAt(db, slug) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Unavailable right now.' }, { status: 503 })
  const body = await req.json().catch(() => ({}))
  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const password = body.password === null ? null : (typeof body.password === 'string' ? body.password : '')
  const r = await setDocPassword(db, slug, password, auth.user.email)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await db.from('acl_audit').insert({ brand: 'bcps', actor_id: auth.user.userId, action: r.on ? 'document_password_set' : 'document_password_removed', object_id: null, detail: { slug } })
  return NextResponse.json({ ok: true, on: r.on, set_at: r.on ? await passwordSetAt(db, slug) : null })
}
