import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Shared prototype access token for the District Community Relations tracker.
// Possession of the in-app page grants access. Replace with real role auth before wider rollout.
const ACCESS_KEY = 'lr-dcr-7b2e4a90'

// GET: return tasks plus recent daily and weekly reports.
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tasks, daily, weekly] = await Promise.all([
    supabase.from('dcr_tasks').select('*').order('created_at', { ascending: true }),
    supabase.from('dcr_daily_reports').select('*').order('report_date', { ascending: false }).limit(60),
    supabase.from('dcr_weekly_reports').select('*').order('week_ending', { ascending: false }).limit(30),
  ])
  const err = tasks.error || daily.error || weekly.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    tasks: tasks.data ?? [],
    daily: daily.data ?? [],
    weekly: weekly.data ?? [],
  })
}

// POST: action-based create/update for tasks and report submission.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, action } = body
    if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (action === 'task_create') {
      const { program_area, title, detail, assignee, due_date } = body
      if (!program_area || !title) {
        return NextResponse.json({ error: 'program_area and title required' }, { status: 400 })
      }
      const { error } = await supabase.from('dcr_tasks').insert({
        program_area,
        title,
        detail: detail ?? null,
        assignee: assignee || 'Noel Hyatt',
        due_date: due_date || null,
        status: 'todo',
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'task_update') {
      const { id, status, title, detail, due_date, program_area, assignee } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (status !== undefined) update.status = status
      if (title !== undefined) update.title = title
      if (detail !== undefined) update.detail = detail
      if (due_date !== undefined) update.due_date = due_date || null
      if (program_area !== undefined) update.program_area = program_area
      if (assignee !== undefined) update.assignee = assignee
      const { error } = await supabase.from('dcr_tasks').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'daily_submit') {
      const { report_date, specialist, completed, in_progress, pending, issues, next_priorities } = body
      const { error } = await supabase.from('dcr_daily_reports').insert({
        report_date: report_date || new Date().toISOString().slice(0, 10),
        specialist: specialist || 'Noel Hyatt',
        completed: completed ?? null,
        in_progress: in_progress ?? null,
        pending: pending ?? null,
        issues: issues ?? null,
        next_priorities: next_priorities ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'weekly_submit') {
      const { week_ending, specialist, accomplishments, outstanding, deadlines, challenges, solutions, ssp_status, awards_status } = body
      const { error } = await supabase.from('dcr_weekly_reports').insert({
        week_ending: week_ending || new Date().toISOString().slice(0, 10),
        specialist: specialist || 'Noel Hyatt',
        accomplishments: accomplishments ?? null,
        outstanding: outstanding ?? null,
        deadlines: deadlines ?? null,
        challenges: challenges ?? null,
        solutions: solutions ?? null,
        ssp_status: ssp_status ?? null,
        awards_status: awards_status ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
