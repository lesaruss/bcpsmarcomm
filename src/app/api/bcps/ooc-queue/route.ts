import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// AUTH, rewritten 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, second pass).
// This route used to accept a shared static key that was hardcoded here AND in
// QueuePage.tsx, so it shipped in the client bundle and sat in a PUBLIC repo -
// meaning anyone could read the District Web Team's task list and, through the
// POST actions below, edit or DELETE any row in it.
//
// Gated on requireDistrictUser (src/lib/bcps-auth.ts) rather than admin: the
// Queue page sits in the sidebar's Platform section and is NOT in Sidebar.tsx's
// SUPERADMIN_PAGES, so every signed-in BCPS member can already open it. That is
// the check that actually guards this data today, per
// canon-gate-new-surfaces-on-the-same-check - gating harder here would break the
// page for the members it is built for.

export async function GET(req: NextRequest) {
  const auth = await requireDistrictUser(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const { action, ...rest } = body

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
