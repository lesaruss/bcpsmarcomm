import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// A signed-in member updates their OWN profile fields only.
export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title.slice(0, 120) : null
  const bio = typeof body.bio === 'string' ? body.bio.slice(0, 1000) : null
  const photo_url = typeof body.photo_url === 'string' ? body.photo_url.slice(0, 500) : null

  const { error } = await svc.from('acl_member_roles')
    .upsert({ user_id: user.id, brand: BRAND, title, bio, photo_url }, { onConflict: 'user_id,brand' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
