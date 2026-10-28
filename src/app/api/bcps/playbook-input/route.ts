import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookItemActor } from '@/lib/bcps-auth'
import { askClaudeJson } from '@/lib/anthropic-key'
import { listTargets, addInput, decideInput, GENERAL_KEY, type InputKind } from '@/lib/playbook-input'
import { backupsOf, handedOff } from '@/lib/playbook-people'

// Team input on a Playbook (V, 2026-10-28). Any reader answers an open
// question, adds to a Missing or Draft section, or adds general input, with
// files; it shows on the page as team input until a lead (the Playbook's
// metadata.transcript_admins) or the superadmin accepts or dismisses it.
// See lib/playbook-input.
//
//   GET ?slug=                    -> { can_add, can_review, targets, open }   open: ids of input awaiting a lead
//   GET ?file=<input>&n=<i>       -> redirect to a short-lived link, for readers of the Playbook
//   POST { action: 'draft', slug, kind, key, source_name, source_text } -> { response }
//   POST { action: 'upload_urls', slug, kind, key, files: [{ name, size }] } -> { uploads }
//   POST { action: 'add', slug, kind, key, response, files: [{ name, path, size }] } -> { ok, id }
//   POST { action: 'accept' | 'dismiss', slug, id } -> { ok }
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = 'playbook-attachments'
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/
const KINDS: InputKind[] = ['question', 'section', 'general']
const MAX_FILES = 10
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_FILE = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|gif|webp|heic|mp4|mov|m4a|mp3|txt|vtt|md|zip)$/i
const DRAFT_MODEL = 'claude-sonnet-5-5'

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  const local = email.split('@')[0].split('.')
  return local.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

async function loadPlaybook(slug: string) {
  if (!SLUG.test(slug)) return null
  const { data } = await svc.from('briefings').select('title, content, updated_at, metadata')
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
  return data
}

// Readers: the Playbook's recipients (or everyone signed in when it has none),
// District admins, the superadmin. Leads: metadata.transcript_admins, the superadmin.
// Backup: metadata.backup_leads, who may review input that has waited five
// business days for a lead (Phase 3, V 2026-10-28).
async function roles(slug: string, email: string, superadmin: boolean, metadata: unknown) {
  const { data: rows } = await svc.from('bcps_brief_recipients').select('attendee_email').eq('brief_slug', slug)
  let reader = superadmin || !rows?.length || rows.some((r) => String(r.attendee_email || '').toLowerCase() === email)
  if (!reader) {
    const { data: admin } = await svc.from('wcm_cert_users').select('is_admin').ilike('email', email).eq('is_admin', true).maybeSingle()
    reader = !!admin
  }
  const leads = (metadata as Record<string, unknown> | null)?.transcript_admins
  const lead = superadmin || (Array.isArray(leads) && leads.some((e) => typeof e === 'string' && e.toLowerCase() === email))
  const backup = !lead && backupsOf(metadata).includes(email)
  return { reader, lead, backup }
}

// Keep the previous version, then write only if nobody saved in between.
async function save(slug: string, before: { content: string; updated_at: string }, html: string, email: string) {
  const { data: rev, error: revErr } = await svc.from('bcps_doc_revisions')
    .insert({ slug, content: before.content, replaced_by_email: email }).select('id').single()
  if (revErr || !rev) return null
  const { data: saved } = await svc.from('briefings').update({ content: html, updated_at: new Date().toISOString() })
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).eq('updated_at', before.updated_at).select('slug')
  return saved?.length ? (rev.id as string) : null
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export async function GET(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  const file = req.nextUrl.searchParams.get('file')

  if (file) {
    if (!auth.ok) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url))
    const { data: row } = await svc.from('bcps_playbook_inputs').select('playbook_slug, files').eq('id', file).maybeSingle()
    const f = Array.isArray(row?.files) ? row!.files[Number(req.nextUrl.searchParams.get('n') || 0)] as { path?: string } | undefined : undefined
    if (!row || !f?.path) return NextResponse.json({ error: 'That file was not found.' }, { status: 404 })
    const pb = await loadPlaybook(row.playbook_slug as string)
    const { reader } = await roles(row.playbook_slug as string, auth.user.email, !!auth.superadmin, pb?.metadata)
    if (!reader) return NextResponse.json({ error: 'You do not have access to this Playbook.' }, { status: 403 })
    const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(f.path, 300)
    if (error || !data) return NextResponse.json({ error: 'That file was not found.' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl)
  }

  const none = { can_add: false, can_review: false, targets: [], open: [] }
  if (!auth.ok) return NextResponse.json(none, { status: auth.status === 401 ? 401 : 200 })
  const slug = String(req.nextUrl.searchParams.get('slug') || '')
  const pb = await loadPlaybook(slug)
  if (!pb) return NextResponse.json(none)
  const { reader, lead, backup } = await roles(slug, auth.user.email, !!auth.superadmin, pb.metadata)
  if (!reader) return NextResponse.json(none)
  const { data: waiting } = lead || backup
    ? await svc.from('bcps_playbook_inputs').select('id, created_at').eq('playbook_slug', slug).eq('status', 'new')
    : { data: [] as { id: string; created_at: string }[] }
  // The backup lead sees only what has waited five business days.
  const open = (waiting ?? []).filter((r) => lead || handedOff(r.created_at as string)).map((r) => r.id)
  return NextResponse.json({ can_add: true, can_review: lead || open.length > 0, targets: listTargets(String(pb.content || '')), open })
}

export async function POST(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const pb = await loadPlaybook(slug)
  if (!pb) return NextResponse.json({ error: 'That Playbook was not found.' }, { status: 404 })
  const { reader, lead, backup } = await roles(slug, auth.user.email, !!auth.superadmin, pb.metadata)
  if (!reader) return NextResponse.json({ error: 'You do not have access to this Playbook.' }, { status: 403 })

  if (body.action === 'accept' || body.action === 'dismiss') {
    if (!lead && !backup) return NextResponse.json({ error: 'Only the project lead can confirm team input.' }, { status: 403 })
    const id = String(body.id || '')
    const { data: row } = await svc.from('bcps_playbook_inputs').select('id, status, created_at').eq('id', id).eq('playbook_slug', slug).maybeSingle()
    if (!row) return NextResponse.json({ error: 'That input was not found.' }, { status: 404 })
    if (!lead && !handedOff(row.created_at as string)) return NextResponse.json({ error: 'The project lead has five business days to review this. It comes to you after that.' }, { status: 403 })
    if (row.status !== 'new') return NextResponse.json({ error: `That input was already ${row.status}.` }, { status: 409 })
    const name = await displayName(auth.user.userId, auth.user.email)
    let html: string
    try { html = decideInput(String(pb.content || ''), id, body.action, name, today()) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 409 }) }
    const rev = await save(slug, { content: String(pb.content || ''), updated_at: pb.updated_at as string }, html, auth.user.email)
    if (!rev) return NextResponse.json({ error: 'The Playbook changed just now. Reload it and try again.' }, { status: 409 })
    await svc.from('bcps_playbook_inputs').update({
      status: body.action === 'accept' ? 'accepted' : 'dismissed', decided_by_email: auth.user.email, decided_at: new Date().toISOString(),
    }).eq('id', id)
    return NextResponse.json({ ok: true })
  }

  // The target must be on the page: an open question, a Missing or Draft
  // section, or general input.
  const kind = body.kind as InputKind
  const key = String(body.key || '')
  const target = KINDS.includes(kind) ? listTargets(String(pb.content || '')).find((t) => t.kind === kind && t.key === key) : undefined
  if (!target) return NextResponse.json({ error: 'That part of the page is no longer open for input.' }, { status: 409 })

  if (body.action === 'draft') {
    const text = String(body.source_text || '').trim().slice(0, 400_000)
    if (text.length < 40) return NextResponse.json({ error: 'That file has no text to read.' }, { status: 400 })
    try {
      const out = await askClaudeJson(DRAFT_MODEL, {
        type: 'object', additionalProperties: false, required: ['response'], properties: { response: { type: 'string' } },
      }, `You draft a team member's input on a Broward County Public Schools project Playbook from a transcript or notes they provide. Write two to five plain sentences in the first person that ${kind === 'question' ? 'answer the question' : kind === 'section' ? 'supply what the section needs' : 'share what matters for the project'}. Use only what the text supports. No em dashes.`,
      `Playbook: ${pb.title}\n${kind === 'question' ? 'Question' : kind === 'section' ? 'Section' : 'Topic'}: ${target.text}\nSource: ${String(body.source_name || 'uploaded file').slice(0, 120)}\n\n<source>\n${text}\n</source>`)
      return NextResponse.json({ response: String(out.response || '') })
    } catch (e) {
      console.error('playbook-input: draft failed', e)
      return NextResponse.json({ error: e instanceof Anthropic.APIError ? `Claude could not read the file (${e.status}). Try again in a minute.` : (e as Error).message }, { status: 502 })
    }
  }

  if (body.action === 'upload_urls') {
    const files = Array.isArray(body.files) ? body.files as { name?: string; size?: number }[] : []
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Attach up to ${MAX_FILES} files at a time.` }, { status: 400 })
    const batch = crypto.randomUUID()
    const uploads: { name: string; path: string; token: string }[] = []
    for (const f of files) {
      const name = String(f.name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      if (!name || !ALLOWED_FILE.test(name)) return NextResponse.json({ error: `${f.name || 'A file'} is not a supported file type.` }, { status: 400 })
      if (!f.size || f.size > MAX_BYTES) return NextResponse.json({ error: `${name} is larger than 50 MB.` }, { status: 400 })
      const path = `${slug}/input/${batch}/${name}`
      const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
      uploads.push({ name, path, token: data.token })
    }
    return NextResponse.json({ uploads })
  }

  if (body.action === 'add') {
    const text = String(body.response || '').trim().slice(0, 5000)
    const files = (Array.isArray(body.files) ? body.files as { name?: string; path?: string; size?: number }[] : [])
      .filter((f) => typeof f.path === 'string' && f.path.startsWith(`${slug}/input/`) && !f.path.includes('..'))
      .slice(0, MAX_FILES)
      .map((f) => ({ name: String(f.name || f.path!.split('/').pop()).slice(0, 120), path: f.path as string, size: Number(f.size) || null }))
    if (!text && !files.length) return NextResponse.json({ error: 'Write your input or attach a file.' }, { status: 400 })
    const name = await displayName(auth.user.userId, auth.user.email)
    const { data: rec, error: recErr } = await svc.from('bcps_playbook_inputs').insert({
      playbook_slug: slug, target_kind: kind, target_text: kind === 'general' ? '' : target.text, body: text, files,
      author_email: auth.user.email, author_name: name,
    }).select('id').single()
    if (recErr || !rec) return NextResponse.json({ error: 'Could not save your input.' }, { status: 500 })
    let html: string
    try {
      html = addInput(String(pb.content || ''), {
        id: rec.id, kind, key: kind === 'general' ? GENERAL_KEY : key, by: name, date: today(), text,
        files: files.map((f, i) => ({ name: f.name, href: `/api/bcps/playbook-input?file=${rec.id}&n=${i}` })),
      })
    } catch (e) {
      await svc.from('bcps_playbook_inputs').delete().eq('id', rec.id)
      return NextResponse.json({ error: (e as Error).message }, { status: 409 })
    }
    const rev = await save(slug, { content: String(pb.content || ''), updated_at: pb.updated_at as string }, html, auth.user.email)
    if (!rev) {
      await svc.from('bcps_playbook_inputs').delete().eq('id', rec.id)
      return NextResponse.json({ error: 'The Playbook changed just now. Try again; your files are still uploaded.' }, { status: 409 })
    }
    await svc.from('bcps_playbook_inputs').update({ revision_id: rev }).eq('id', rec.id)
    await svc.from('playbook_records').insert({
      slug, brand_slug: 'bcps', author: auth.user.email, kind: 'edit', source: 'team-input', applied: true,
      body: `Team input from ${name} on ${kind === 'general' ? 'the page' : `"${target.text}"`}.${files.length ? ` ${files.length} file${files.length === 1 ? '' : 's'}.` : ''} Previous content kept in bcps_doc_revisions ${rev}.`,
    }).then(() => null, () => null)
    return NextResponse.json({ ok: true, id: rec.id })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
