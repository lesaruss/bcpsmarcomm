import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, course_id } = await req.json()
    if (!user_id || !course_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const { error } = await supabase
      .from('wcm_certifications')
      .upsert({ user_id, course_id }, { onConflict: 'user_id,course_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Complete API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
