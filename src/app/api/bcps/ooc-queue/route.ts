import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ACCESS_KEY = 'lr-ooc-web-9d2e7f14'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('ooc_web_tasks')
    .select('*')
    .neq('status', 'done')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tasks: data ?? [] })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, action, ...rest } = body
    if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (action === 'task_create') {
      const { category, title, detail, assignee, status, due_date, priority } = rest
      if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
      const { error } = await supabase.from('ooc_web_tasks').insert({
        category: category ?? 'General',
        title,
        detail: detail ?? null,
        assignee: assignee ?? 'sr',
        status: status ?? 'todo',
        due_date: due_date ?? null,
        priority: priority ?? 'med',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'task_update') {
      const { id, ...fields } = rest
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      const allowed = ['status', 'title', 'detail', 'assignee', 'category', 'due_date', 'priority']
      allowed.forEach(k => { if (fields[k] !== undefined) update[k] = fields[k] })
      const { error } = await supabase.from('ooc_web_tasks').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'task_delete') {
      const { id } = rest
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const { error } = await supabase.from('ooc_web_tasks').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
