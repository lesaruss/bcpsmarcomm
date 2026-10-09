import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR } from '@/lib/proudPointsApi'
import { isReviewer } from '@/lib/proudPoints'

// Ideas gallery: past Proud Points from the old form, grouped by theme and
// labeled only by school level (seeded by scripts/proud-points-seed.py, which
// strips school names, mascots, cities and people). The District Web Team can
// hide any idea that still gives a school away.
// GET: visible ideas (reviewers also get hidden ones, flagged).
// POST { id, hidden }: reviewers only.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })
  const reviewer = !!(me.user && (await isReviewer(svc, me.user)))
  let q = svc.from('bcps_proud_point_ideas').select('id, theme, school_level, text, hidden').order('sort')
  if (!reviewer) q = q.eq('hidden', false)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ideas: data ?? [], can_hide: reviewer })
}

export async function POST(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })
  if (!me.user || !(await isReviewer(svc, me.user))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, hidden } = (await req.json().catch(() => ({}))) as { id?: string; hidden?: boolean }
  if (!id || typeof hidden !== 'boolean') return NextResponse.json({ error: 'id and hidden are required' }, { status: 400 })
  const { error } = await svc.from('bcps_proud_point_ideas').update({ hidden, hidden_by_email: hidden ? me.email : null }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
