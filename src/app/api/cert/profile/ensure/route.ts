import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, email } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    await supabase.from('wcm_cert_users').upsert(
      { user_id, email: email ?? null, is_admin: false },
      { onConflict: 'user_id', ignoreDuplicates: true }
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Ensure profile error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
