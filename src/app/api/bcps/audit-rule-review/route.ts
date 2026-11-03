import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'

// Audit rule review (Sean, Hot Lab 2026-10-29). Every rule the audit flags
// pages for, with the counts and example pages from the latest audit of every
// page, so Sean and the District Web Team can go through them one by one and
// approve, change, or drop each rule before the audit settings are updated.
//   GET                          rules + the Finalsite-owned findings kept off WCM lists + every
//                                reviewer's decision + who is asking
//   POST { check_id, decision, comment? }   save the caller's decision on a rule
//   POST { check_id, clear: true }          take the caller's decision back
// Gated on the 'audit-rules-review' page, the same acl rows that decide the
// page in the sidebar (admins by role, the District Web Team by group grant).
export const dynamic = 'force-dynamic'

const PAGE = 'audit-rules-review'
const DECISIONS = ['approve', 'change', 'not_applicable', 'discuss'] as const

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  return email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const [rules, finalsite, reviews] = await Promise.all([
    svc.rpc('bcps_audit_rule_summary'),
    svc.rpc('bcps_audit_finalsite_summary'),
    svc.from('bcps_audit_rule_reviews').select('check_id, reviewer_email, reviewer_name, decision, comment, updated_at').order('updated_at', { ascending: false }),
  ])
  if (rules.error) return NextResponse.json({ error: rules.error.message }, { status: 500 })
  if (finalsite.error) return NextResponse.json({ error: finalsite.error.message }, { status: 500 })
  if (reviews.error) return NextResponse.json({ error: reviews.error.message }, { status: 500 })
  // Findings only Finalsite can fix (Sean, Hot Lab 2026-11-03). The scan tags
  // each finding with who owns the fix and the WCM's audit already leaves the
  // Finalsite-owned ones off its red list. They come back in the same card
  // shape under a 'finalsite:' id, so the team can see and decide on them too.
  type FS = { id: string; description: string | null; impact: string | null; help_url: string | null; items: number; pages: number; departments: number; examples: { page_url: string; owner: string | null }[] }
  const finalsiteRules = ((finalsite.data ?? []) as FS[]).map((f) => ({
    id: `finalsite:${f.id}`,
    area: 'Accessibility',
    title: f.description || f.id,
    why: `Only Finalsite can fix this. It comes from the site template, not from a WCM's content, so it is kept off WCM lists.${f.impact ? ` Impact: ${f.impact}.` : ''}`,
    steps: null,
    course: null,
    fail: f.items, review: 0, pass: 0,
    departments: f.departments, pages: f.pages,
    help_url: f.help_url,
    examples: f.examples.map((e) => ({ page_url: e.page_url, status: 'fail', detail: null, items: null, owner: e.owner })),
  }))
  return NextResponse.json({ me: auth.user.email.toLowerCase(), rules: rules.data ?? [], finalsite: finalsiteRules, reviews: reviews.data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = await req.json().catch(() => ({})) as { check_id?: string; decision?: string; comment?: string; clear?: boolean }
  const checkId = (b.check_id || '').trim().slice(0, 120)
  if (!checkId) return NextResponse.json({ error: 'check_id required' }, { status: 400 })
  const email = auth.user.email.toLowerCase()

  if (b.clear) {
    const { error } = await svc.from('bcps_audit_rule_reviews').delete().eq('check_id', checkId).eq('reviewer_email', email)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!DECISIONS.includes(b.decision as typeof DECISIONS[number])) return NextResponse.json({ error: 'Pick a decision first.' }, { status: 400 })
  const comment = (b.comment || '').trim().slice(0, 4000) || null
  const { error } = await svc.from('bcps_audit_rule_reviews').upsert({
    check_id: checkId,
    reviewer_email: email,
    reviewer_name: await displayName(auth.user.userId, email),
    decision: b.decision,
    comment,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'check_id,reviewer_email' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
