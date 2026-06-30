import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ACCESS_KEY = 'lr-dcr-7b2e4a90'

async function notifyNeedsSupport(taskTitle: string, programArea: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'DCR Tracker <noreply@bcpsmarcomm.com>',
        to: 'carolyn.stewart@browardschools.com',
        subject: `Needs Support: ${taskTitle}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;">
            <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">
              A task has been flagged as <strong>Needs Support</strong> in the DCR Task Tracker.
            </p>
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;width:130px;">Task</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${taskTitle}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Program area</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${programArea}</td>
              </tr>
            </table>
            <a href="https://bcpsmarcomm.com/bcps?page=community-relations"
               style="display:inline-block;background:#003087;color:#fff;padding:10px 20px;text-decoration:none;font-size:13px;font-weight:700;border-radius:4px;">
              View the board
            </a>
            <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
              Broward County Public Schools - District Community Relations
            </p>
          </div>
        `,
      }),
    })
  } catch {
    // Notification failure should not block the status update.
  }
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (key !== ACCESS_KEY) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tasks, weekly, notes] = await Promise.all([
    supabase.from('dcr_tasks').select('*').order('created_at', { ascending: true }),
    supabase.from('dcr_weekly_reports').select('*').order('week_ending', { ascending: false }).limit(30),
    supabase.from('dcr_project_notes').select('*'),
  ])
  const err = tasks.error || weekly.error || notes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    tasks:        tasks.data ?? [],
    weekly:       weekly.data ?? [],
    projectNotes: notes.data ?? [],
  })
}

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
      if (status       !== undefined) update.status       = status
      if (title        !== undefined) update.title        = title
      if (detail       !== undefined) update.detail       = detail
      if (due_date     !== undefined) update.due_date     = due_date || null
      if (program_area !== undefined) update.program_area = program_area
      if (assignee     !== undefined) update.assignee     = assignee

      const { error } = await supabase.from('dcr_tasks').update(update).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      if (status === 'blocked') {
        const { data: task } = await supabase
          .from('dcr_tasks').select('title, program_area').eq('id', id).single()
        if (task) notifyNeedsSupport(task.title, task.program_area)
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'task_delete') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const { error } = await supabase.from('dcr_tasks').delete().eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (action === 'weekly_submit') {
      const {
        week_ending, specialist,
        accomplishments, outstanding, deadlines,
        challenges, solutions, ssp_status, awards_status,
      } = body
      const { error } = await supabase.from('dcr_weekly_reports').insert({
        week_ending:    week_ending || new Date().toISOString().slice(0, 10),
        specialist:     specialist || 'Noel Hyatt',
        accomplishments: accomplishments ?? null,
        outstanding:    outstanding ?? null,
        deadlines:      deadlines ?? null,
        challenges:     challenges ?? null,
        solutions:      solutions ?? null,
        ssp_status:     ssp_status ?? null,
        awards_status:  awards_status ?? null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // ── Project notes + pinned resources ─────────────────────────────────────
    if (action === 'project_note_save') {
      const { program_area, notes, pinned_slugs } = body
      if (!program_area) return NextResponse.json({ error: 'program_area required' }, { status: 400 })
      const { error } = await supabase.from('dcr_project_notes').upsert({
        program_area,
        notes:        notes ?? null,
        pinned_slugs: pinned_slugs ?? [],
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'program_area' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
