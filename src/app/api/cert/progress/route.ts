import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { user_id, course_id, module_id, page_id, completed, completed_at } = body

    if (!user_id || !course_id || !module_id || !page_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const record: Record<string, unknown> = {
      user_id, course_id, module_id, page_id,
      last_visited_at: new Date().toISOString(),
    }
    if (completed) {
      record.completed = true
      record.completed_at = completed_at || new Date().toISOString()
    }

    const { error } = await supabase
      .from('wcm_cert_progress')
      .upsert(record, { onConflict: 'user_id,course_id,module_id,page_id' })

    if (error) {
      console.error('Progress upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Progress API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
