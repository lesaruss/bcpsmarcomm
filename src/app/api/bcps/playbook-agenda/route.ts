import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookTranscriptAccess } from '@/lib/bcps-auth'
import { loadPlaybook } from '@/lib/playbook-meeting-transcript'
import { logChange } from '@/lib/doc-change-log'
import { proposeAgenda, cleanAgendaItems, agendaRecordHtml, applyAgendaToPlaybook, leadNameOf, type AgendaItem, type ItemOutcome } from '@/lib/playbook-agenda'

// Agenda builder (BCPS Document System, Phase 3, V 2026-10-28). A Playbook's
// leads (metadata.transcript_admins) and the superadmin get Build next agenda:
// the page proposes up to six items from what is still open, the lead edits
// them, and saving files the agenda as a Meeting Record under the Playbook
// and fills its Next Meeting Agenda section. See lib/playbook-agenda.
//
//   GET ?slug=   -> { allowed, label, date, items, more, last }
//   POST { action: 'save', slug, label, date, items } -> { path, playbook_updated }
export const dynamic = 'force-dynamic'

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const BCPS_DOC_TEMPLATE_ID = 'f7037d82-c5e2-4997-8631-aa68993157a4'

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const inDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  const local = email.split('@')[0].split('.')
  return local.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

async function recipientsOf(slug: string) {
  const { data } = await svc.from('bcps_brief_recipients').select('attendee_name, attendee_email').eq('brief_slug', slug)
  return (data ?? []).filter((r) => r.attendee_email).map((r) => ({ name: String(r.attendee_name || ''), email: String(r.attendee_email) }))
}

// Item keys of this Playbook's earlier agendas, newest first.
async function earlierAgendas(slug: string): Promise<{ keys: string[][]; last: { date: string; path: string | null } | null; carried: AgendaItem[] }> {
  const { data } = await svc.from('bcps_playbook_agendas').select('meeting_date, record_slug, items, outcomes')
    .eq('playbook_slug', slug).order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).limit(6)
  const rows = data ?? []
  // A strike is an agenda an item did not get settled on: once a meeting's
  // outcomes are in, its settled items do not count toward the third strike.
  const keys = rows.map((r) => {
    const settled = new Set((Array.isArray(r.outcomes) ? r.outcomes as ItemOutcome[] : []).filter((o) => o.outcome === 'settled').map((o) => o.key))
    return (Array.isArray(r.items) ? r.items : []).map((i: { key?: string }) => String(i?.key || '')).filter((k: string) => k && !settled.has(k))
  })
  const last = rows[0] ? { date: String(rows[0].meeting_date), path: rows[0].record_slug ? `/playbooks/${slug}/${rows[0].record_slug}` : null } : null
  // What the latest agenda's meeting did not settle, once its outcomes are in.
  const latest = rows[0]
  const outcomes = (Array.isArray(latest?.outcomes) ? latest!.outcomes : []) as ItemOutcome[]
  const carried = outcomes.length
    ? ((latest!.items ?? []) as AgendaItem[]).filter((it) => outcomes.find((o) => o.key === it.key)?.outcome !== 'settled')
        .map((it) => ({ ...it, detail: [outcomes.find((o) => o.key === it.key)?.note, `Not settled at the ${latest!.meeting_date} meeting.`].filter(Boolean).join(' ') }))
    : []
  return { keys, last, carried }
}

const defaultLabel = (title: string) => `${title.replace(/\s*\(.*?\)\s*$/, '')} Meeting`

export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get('slug') || '')
  if (!SLUG.test(slug)) return NextResponse.json({ allowed: false })
  const auth = await requirePlaybookTranscriptAccess(req, slug)
  if (!auth.ok) return NextResponse.json({ allowed: false }, { status: auth.status === 401 ? 401 : 200 })
  const pb = await loadPlaybook(svc, slug)
  if (!pb) return NextResponse.json({ allowed: false })
  const [recipients, earlier, inputs] = await Promise.all([
    recipientsOf(slug),
    earlierAgendas(slug),
    svc.from('bcps_playbook_inputs').select('id', { count: 'exact', head: true }).eq('playbook_slug', slug).eq('status', 'new'),
  ])
  const day = today()
  const { items, more } = proposeAgenda(pb.html, { today: day, leadName: leadNameOf(pb.metadata, recipients), openInputs: inputs.count ?? 0, earlier: earlier.keys, carried: earlier.carried })
  return NextResponse.json({ allowed: true, label: defaultLabel(pb.title), date: inDays(day, 7), items, more, last: earlier.last })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'That Playbook was not found.' }, { status: 404 })
  const auth = await requirePlaybookTranscriptAccess(req, slug)
  if (!auth.ok) return NextResponse.json({ error: auth.status === 403 ? 'Only this project\'s leads build its meeting agenda.' : auth.error }, { status: auth.status })
  if (body.action !== 'save') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const date = String(body.date || '')
  const label = String(body.label || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!DATE.test(date)) return NextResponse.json({ error: 'Pick the meeting date.' }, { status: 400 })
  if (!label) return NextResponse.json({ error: 'Name the meeting.' }, { status: 400 })
  const pb = await loadPlaybook(svc, slug)
  if (!pb) return NextResponse.json({ error: 'That Playbook was not found.' }, { status: 404 })
  const earlier = await earlierAgendas(slug)
  const items = cleanAgendaItems(body.items, earlier.keys)
  if (!items.length) return NextResponse.json({ error: 'Keep at least one agenda item. Each needs Decide, Assign, Confirm or Review, and a title.' }, { status: 400 })

  const { data: tpl } = await svc.from('templates').select('parameters, version').eq('id', BCPS_DOC_TEMPLATE_ID).maybeSingle()
  const head = (tpl?.parameters as Record<string, unknown> | null)?.html_head
  if (typeof head !== 'string' || !head) return NextResponse.json({ error: 'The BCPS document template could not be read.' }, { status: 500 })
  const author = await displayName(auth.user.userId, auth.user.email)

  // The agenda is the meeting's record; the notes join it after the meeting.
  const base = `${slug}-agenda-${date}`.slice(0, 120)
  const { data: taken } = await svc.from('briefings').select('slug').like('slug', `${base}%`)
  const used = new Set((taken ?? []).map((r) => r.slug as string))
  let recordSlug = base
  for (let n = 2; used.has(recordSlug); n++) recordSlug = `${base}-${n}`
  const path = `/playbooks/${slug}/${recordSlug}`
  const { error: insErr } = await svc.from('briefings').insert({
    slug: recordSlug,
    tenant_id: pb.tenantId,
    brand_slug: 'bcps',
    type: 'record',
    author,
    title: `${label}: Agenda`,
    content: agendaRecordHtml(head, pb, label, date, author, items),
    metadata: {
      parent_playbook_slug: slug, doc_kind: 'meeting', doc_type: 'meeting-record', layout: 'groups',
      source: 'agenda builder', meeting_date: date, agenda_items: items.length,
      template_id: BCPS_DOC_TEMPLATE_ID, template_version: tpl?.version ?? null, client: true,
    },
  })
  if (insErr) return NextResponse.json({ error: 'The agenda could not be filed.' }, { status: 500 })
  const { data: recipients } = await svc.from('bcps_brief_recipients').select('*').eq('brief_slug', slug)
  if (recipients?.length) {
    await svc.from('bcps_brief_recipients').insert(recipients.map((r) => {
      const { id: _id, created_at: _c, ...rest } = r as Record<string, unknown>
      return { ...rest, brief_slug: recordSlug }
    }))
  }

  // The Playbook's Next Meeting Agenda section (and Concerns to Watch for an
  // item on its third agenda), when it has them. The previous
  // content is kept; the write only lands if nobody saved in between.
  let revisionId: string | null = null
  const filled = applyAgendaToPlaybook(pb.html, items, date, path)
  if (filled) {
    const { data: cur } = await svc.from('briefings').select('content, updated_at').eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
    if (cur && String(cur.content || '') === pb.html) {
      const { data: rev } = await svc.from('bcps_doc_revisions').insert({ slug, content: pb.html, replaced_by_email: auth.user.email }).select('id').single()
      if (rev) {
        const { data: saved } = await svc.from('briefings').update({ content: filled, updated_at: new Date().toISOString() })
          .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).eq('updated_at', cur.updated_at).select('slug')
        if (saved?.length) revisionId = rev.id as string
      }
    }
  }
  await logChange(svc, {
    slug, action: 'agenda_saved', actor: auth.user.email, approvedBy: auth.user.email,
    source: { record: recordSlug, meeting_date: date, items: items.map((i) => `${i.verb}: ${i.title}`) },
    summary: `Agenda for ${date} saved (${items.length} item${items.length === 1 ? '' : 's'}) by ${author}.`, revisionId, after: revisionId ? filled : null,
  })
  await svc.from('bcps_playbook_agendas').insert({
    playbook_slug: slug, record_slug: recordSlug, meeting_date: date, meeting_label: label, items, created_by_email: auth.user.email, revision_id: revisionId,
  })
  return NextResponse.json({ path, playbook_updated: !!revisionId, has_section: !!filled })
}
