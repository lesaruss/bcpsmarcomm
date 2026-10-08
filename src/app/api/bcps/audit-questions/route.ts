import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deptAccess, identifyCaller } from '@/lib/bcps-audit-auth'

// Audit question bank (Sean, 2026-10-08). A WCM stuck on an audit or ADA item
// asks from the item itself; the District Web Team answers; the answer then
// shows under that item for every WCM.
//   GET  ?check_id=        answered questions on that item, plus the
//                          caller's own open ones
//   GET  ?all=1            every question, for the team (admins)
//   POST { department_id | school_id, result_id, page_url, check_id,
//          check_title, question }            ask
//   PATCH { id, answer?, status?, shared? }   answer or close (admins)
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const COLS = 'id, created_at, asked_by, department_id, school_id, result_id, page_url, check_id, check_title, question, status, answer, answered_by, answered_at, shared'

export async function GET(req: NextRequest) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
  const q = req.nextUrl.searchParams
  if (q.get('all')) {
    if (!caller.admin) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    const { data, error } = await supabase.from('bcps_audit_questions').select(`${COLS}, bcps_departments(name), bcps_schools(name)`).order('created_at', { ascending: false }).limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ questions: data ?? [] })
  }
  const check = q.get('check_id')
  if (!check) return NextResponse.json({ error: 'check_id required' }, { status: 400 })
  const { data, error } = await supabase.from('bcps_audit_questions').select(COLS).eq('check_id', check).neq('status', 'closed').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Everyone sees shared answers; askers also see their own questions.
  const list = (data ?? []).filter((r) => (r.status === 'answered' && r.shared) || r.asked_by === caller.email)
  return NextResponse.json({ questions: list.map((r) => ({ id: r.id, created_at: r.created_at, mine: r.asked_by === caller.email, question: r.question, status: r.status, answer: r.answer, answered_at: r.answered_at })) })
}

export async function POST(req: NextRequest) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
  const b = await req.json().catch(() => ({})) as Record<string, string | undefined>
  const question = (b.question || '').trim()
  if (question.length < 3) return NextResponse.json({ error: 'Type your question first.' }, { status: 400 })
  if (!b.check_id || !b.check_title) return NextResponse.json({ error: 'check_id and check_title required' }, { status: 400 })
  if (b.department_id) {
    const { data: dept } = await supabase.from('bcps_departments').select('id, wcm_email, director_email').eq('id', b.department_id).maybeSingle()
    if (!dept || !deptAccess(caller, dept).view) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  } else if (b.school_id) {
    if (!caller.admin) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  } else return NextResponse.json({ error: 'department_id or school_id required' }, { status: 400 })
  const { data, error } = await supabase.from('bcps_audit_questions').insert({
    asked_by: caller.email, department_id: b.department_id ?? null, school_id: b.school_id ?? null,
    result_id: b.result_id ?? null, page_url: b.page_url ?? null,
    check_id: b.check_id.slice(0, 120), check_title: b.check_title.slice(0, 300), question: question.slice(0, 2000),
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  const caller = await identifyCaller(req, supabase)
  if (!caller.ok) return NextResponse.json({ error: 'Not signed in' }, { status: caller.status })
  if (!caller.admin) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; answer?: string; status?: string; shared?: boolean }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (typeof b.answer === 'string') {
    const a = b.answer.trim()
    if (!a) return NextResponse.json({ error: 'Type an answer first.' }, { status: 400 })
    Object.assign(patch, { answer: a.slice(0, 4000), status: 'answered', answered_by: caller.email, answered_at: new Date().toISOString() })
  }
  if (b.status === 'closed' || b.status === 'open') patch.status = b.status
  if (typeof b.shared === 'boolean') patch.shared = b.shared
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  const { error } = await supabase.from('bcps_audit_questions').update(patch).eq('id', b.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
