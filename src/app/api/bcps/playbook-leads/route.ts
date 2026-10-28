import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookItemActor } from '@/lib/bcps-auth'
import { leadsOf, backupsOf } from '@/lib/playbook-people'

// Project leads and the backup lead (BCPS Document System, Phase 3, V
// 2026-10-28). The superadmin names a Playbook's leads
// (metadata.transcript_admins) and its backup lead (metadata.backup_leads); a
// lead can name or change the backup. Both are picked from the Playbook's
// readers, so they can open it. Only the metadata changes, not the page.
//
//   GET ?slug=  -> { allowed, can_set_leads, leads, backups, people }
//   POST { slug, leads?, backups } -> { ok }
export const dynamic = 'force-dynamic'

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/
const MAX = 3

async function load(slug: string) {
  if (!SLUG.test(slug)) return null
  const { data } = await svc.from('briefings').select('metadata').eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
  return data
}

async function people(slug: string) {
  const { data } = await svc.from('bcps_brief_recipients').select('attendee_name, attendee_email').eq('brief_slug', slug)
  const seen = new Set<string>()
  return (data ?? []).flatMap((r) => {
    const email = String(r.attendee_email || '').toLowerCase()
    if (!email || seen.has(email)) return []
    seen.add(email)
    return [{ name: String(r.attendee_name || '') || email, email }]
  }).sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ allowed: false }, { status: auth.status === 401 ? 401 : 200 })
  const slug = String(req.nextUrl.searchParams.get('slug') || '')
  const pb = await load(slug)
  if (!pb) return NextResponse.json({ allowed: false })
  const leads = leadsOf(pb.metadata)
  if (!auth.superadmin && !leads.includes(auth.user.email)) return NextResponse.json({ allowed: false })
  return NextResponse.json({ allowed: true, can_set_leads: !!auth.superadmin, leads, backups: backupsOf(pb.metadata), people: await people(slug) })
}

export async function POST(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const pb = await load(slug)
  if (!pb) return NextResponse.json({ error: 'That Playbook was not found.' }, { status: 404 })
  const current = leadsOf(pb.metadata)
  if (!auth.superadmin && !current.includes(auth.user.email)) return NextResponse.json({ error: 'Only this project\'s leads name its backup lead.' }, { status: 403 })

  const readers = new Set((await people(slug)).map((p) => p.email))
  const pick = (v: unknown) => Array.from(new Set((Array.isArray(v) ? v : []).map((e) => String(e || '').toLowerCase().trim()).filter(Boolean)))
  const leads = auth.superadmin && Array.isArray(body.leads) ? pick(body.leads) : current
  const backups = pick(body.backups)
  if (auth.superadmin && Array.isArray(body.leads) && !leads.length) return NextResponse.json({ error: 'Every project needs at least one lead.' }, { status: 400 })
  if (leads.length > MAX || backups.length > MAX) return NextResponse.json({ error: `Up to ${MAX} leads and ${MAX} backups.` }, { status: 400 })
  const outside = [...(auth.superadmin ? leads : []), ...backups].filter((e) => !readers.has(e))
  if (outside.length) return NextResponse.json({ error: `${outside.join(', ')} cannot open this Playbook. Add them to its access list first.` }, { status: 400 })
  if (backups.some((e) => leads.includes(e))) return NextResponse.json({ error: 'A backup lead has to be someone other than the leads.' }, { status: 400 })

  const metadata = {
    ...((pb.metadata ?? {}) as Record<string, unknown>),
    transcript_admins: leads,
    backup_leads: backups,
    leads_changed: { by: auth.user.email, at: new Date().toISOString() },
  }
  // Only the metadata changes; updated_at stays, so a page edit in progress still saves.
  const { error } = await svc.from('briefings').update({ metadata }).eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug)
  if (error) return NextResponse.json({ error: 'The leads could not be saved.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
