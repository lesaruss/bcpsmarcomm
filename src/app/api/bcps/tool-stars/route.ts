import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// The signed-in member's starred Tools & Resources tiles (Sean, 2026-10-20),
// saved to their account in bcps_member_prefs. Each person reads and writes
// their own row only. stars: null = never starred anything.
const MAX_STARS = 100

async function signedIn(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function GET(req: NextRequest) {
  const user = await signedIn(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data, error } = await svc.from('bcps_member_prefs').select('tool_stars').eq('user_id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stars: (data?.tool_stars as string[] | null) ?? null })
}

export async function POST(req: NextRequest) {
  const user = await signedIn(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!Array.isArray(body.stars)) return NextResponse.json({ error: 'stars must be a list' }, { status: 400 })
  const stars = Array.from(new Set((body.stars as unknown[]).filter((s): s is string => typeof s === 'string' && s.length <= 200))).slice(0, MAX_STARS)
  const { error } = await svc.from('bcps_member_prefs')
    .upsert({ user_id: user.id, tool_stars: stars, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, stars })
}
