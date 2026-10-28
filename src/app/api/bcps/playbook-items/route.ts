import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookItemActor } from '@/lib/bcps-auth'
import { askClaudeJson as askJson } from '@/lib/anthropic-key'
import { listItems, completeItem, type ItemKind, type Recipient } from '@/lib/playbook-items'

// Complete a Playbook item from the document (V, 2026-10-28). The person who
// owns a Work Queue or Action Items entry, or a superadmin, sees a Complete
// button beside it; they write a response, attach files, and the item moves
// to Completed with the response and links. See lib/playbook-items.
//
//   GET ?slug=                    -> { items }   the open items this person may complete
//   GET ?file=<completion>&n=<i>  -> redirect to a short-lived link, for readers of the Playbook
//   POST { action: 'prompt', slug, kind, key }          -> { prompt, expects_files }
//   POST { action: 'draft', slug, kind, key, source_name, source_text } -> { response }
//   POST { action: 'upload_urls', slug, kind, key, files: [{ name, size }] } -> { uploads }
//   POST { action: 'complete', slug, kind, key, response, files: [{ name, path, size }] } -> { ok }
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = 'playbook-attachments'
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/
const MAX_FILES = 10
const MAX_BYTES = 50 * 1024 * 1024
const ALLOWED_FILE = /\.(pdf|docx?|xlsx?|csv|pptx?|jpe?g|png|gif|webp|heic|mp4|mov|m4a|mp3|txt|vtt|md|zip)$/i
const FAST_MODEL = 'claude-haiku-5-5'
const DRAFT_MODEL = 'claude-sonnet-5-5'

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  const local = email.split('@')[0].split('.')
  return local.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

async function loadPlaybook(slug: string) {
  const { data } = await svc.from('briefings').select('title, content, updated_at')
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
  return data
}

async function recipientsOf(slug: string): Promise<Recipient[]> {
  const { data } = await svc.from('bcps_brief_recipients').select('attendee_name, attendee_email').eq('brief_slug', slug)
  return (data ?? []).filter((r) => r.attendee_email).map((r) => ({ name: String(r.attendee_name || ''), email: String(r.attendee_email) }))
}

// The open item this person may complete, or an error to send back.
async function itemFor(slug: string, kind: unknown, key: unknown, email: string, superadmin: boolean) {
  if (!SLUG.test(slug)) return { error: 'That Playbook was not found.', status: 404 }
  const pb = await loadPlaybook(slug)
  if (!pb) return { error: 'That Playbook was not found.', status: 404 }
  const item = listItems(String(pb.content || ''), await recipientsOf(slug)).find((i) => i.kind === kind && i.key === key)
  if (!item) return { error: 'That item is no longer open on this Playbook.', status: 409 }
  if (!superadmin && !item.owners.includes(email)) return { error: 'Only the person who owns this item can complete it.', status: 403 }
  return { pb, item }
}

// When Claude is unavailable the lightbox still opens with a plain prompt.
function fallbackPrompt(text: string) {
  const files = /\b(attach|deck|list|share|send|upload|document|report|memo|draft|slides?|spreadsheet|file)\b/i.test(text)
  return {
    prompt: files ? 'Say what you did and attach anything this item produced.' : 'Say what you did to complete this item.',
    expects_files: files,
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  const file = req.nextUrl.searchParams.get('file')

  if (file) {
    if (!auth.ok) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`, req.url))
    const { data: c } = await svc.from('bcps_playbook_completions').select('playbook_slug, files').eq('id', file).maybeSingle()
    const f = Array.isArray(c?.files) ? c!.files[Number(req.nextUrl.searchParams.get('n') || 0)] as { path?: string } | undefined : undefined
    if (!c || !f?.path) return NextResponse.json({ error: 'That file was not found.' }, { status: 404 })
    // Readers of the Playbook: its recipients, District admins, the superadmin.
    let allowed = !!auth.superadmin
    if (!allowed) {
      const readers = await recipientsOf(c.playbook_slug as string)
      allowed = !readers.length || readers.some((r) => r.email.toLowerCase() === auth.user.email)
    }
    if (!allowed) {
      const { data: admin } = await svc.from('wcm_cert_users').select('is_admin').ilike('email', auth.user.email).eq('is_admin', true).maybeSingle()
      allowed = !!admin
    }
    if (!allowed) return NextResponse.json({ error: 'You do not have access to this Playbook.' }, { status: 403 })
    const { data, error } = await svc.storage.from(BUCKET).createSignedUrl(f.path, 300)
    if (error || !data) return NextResponse.json({ error: 'That file was not found.' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl)
  }

  if (!auth.ok) return NextResponse.json({ items: [] }, { status: auth.status === 401 ? 401 : 200 })
  const slug = String(req.nextUrl.searchParams.get('slug') || '')
  if (!SLUG.test(slug)) return NextResponse.json({ items: [] })
  const pb = await loadPlaybook(slug)
  if (!pb) return NextResponse.json({ items: [] })
  const items = listItems(String(pb.content || ''), await recipientsOf(slug))
    .filter((i) => auth.superadmin || i.owners.includes(auth.user.email))
    .map((i) => ({ kind: i.kind, key: i.key, text: i.text }))
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const auth = await requirePlaybookItemActor(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const kind = body.kind as ItemKind
  const found = await itemFor(slug, kind, body.key, auth.user.email, !!auth.superadmin)
  if ('error' in found) return NextResponse.json({ error: found.error }, { status: found.status })
  const { pb, item } = found

  // What this item asks for, so the lightbox can say what to provide.
  if (body.action === 'prompt') {
    try {
      const out = await askJson(FAST_MODEL, {
        type: 'object', additionalProperties: false, required: ['prompt', 'expects_files'],
        properties: { prompt: { type: 'string' }, expects_files: { type: 'boolean' } },
      }, `You help a Broward County Public Schools staff member close out an item on a project Playbook. Given the item, write one or two short, plain sentences telling them what to include in their response so the team knows it is done: what to say, and which files to attach if the item produced any (a list, a deck, a memo, a report). Speak to them directly ("Attach ..."). "expects_files" is true when the item produces or shares something that should be attached. No em dashes.`,
      `Playbook: ${pb.title}\nItem: ${item.text}${item.ownerText ? `\nOwner: ${item.ownerText}` : ''}`)
      return NextResponse.json({ prompt: String(out.prompt || ''), expects_files: !!out.expects_files })
    } catch (e) {
      console.error('playbook-items: prompt failed', e)
      return NextResponse.json(fallbackPrompt(item.text))
    }
  }

  // Draft the response from a transcript or notes the person dropped in.
  if (body.action === 'draft') {
    const text = String(body.source_text || '').trim().slice(0, 400_000)
    if (text.length < 40) return NextResponse.json({ error: 'That file has no text to read.' }, { status: 400 })
    try {
      const out = await askJson(DRAFT_MODEL, {
        type: 'object', additionalProperties: false, required: ['response'], properties: { response: { type: 'string' } },
      }, `You draft a short completion note for an item on a Broward County Public Schools project Playbook, from a transcript or notes the item's owner provides. Write two to five plain sentences in the first person, as the owner: what was done, when, who it went to, and anything still outstanding. Use only what the text supports; if it does not show the item was done, say what it does show. No em dashes.`,
      `Playbook: ${pb.title}\nItem: ${item.text}\nSource: ${String(body.source_name || 'uploaded file').slice(0, 120)}\n\n<source>\n${text}\n</source>`)
      return NextResponse.json({ response: String(out.response || '') })
    } catch (e) {
      console.error('playbook-items: draft failed', e)
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
      const path = `${slug}/${batch}/${name}`
      const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
      uploads.push({ name, path, token: data.token })
    }
    return NextResponse.json({ uploads })
  }

  if (body.action === 'complete') {
    const response = String(body.response || '').trim().slice(0, 5000)
    const files = (Array.isArray(body.files) ? body.files as { name?: string; path?: string; size?: number }[] : [])
      .filter((f) => typeof f.path === 'string' && f.path.startsWith(`${slug}/`) && !f.path.includes('..'))
      .slice(0, MAX_FILES)
      .map((f) => ({ name: String(f.name || f.path!.split('/').pop()).slice(0, 120), path: f.path as string, size: Number(f.size) || null }))
    if (!response && !files.length) return NextResponse.json({ error: 'Add a response or attach a file.' }, { status: 400 })

    const name = await displayName(auth.user.userId, auth.user.email)
    const { data: rec, error: recErr } = await svc.from('bcps_playbook_completions').insert({
      playbook_slug: slug, item_kind: kind, item_text: item.text, response, files,
      completed_by_email: auth.user.email, completed_by_name: name,
    }).select('id').single()
    if (recErr || !rec) return NextResponse.json({ error: 'Could not record the completion.' }, { status: 500 })

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    let out: ReturnType<typeof completeItem>
    try {
      out = completeItem(String(pb.content || ''), {
        kind, key: item.key, by: name, date: today, response,
        files: files.map((f, i) => ({ name: f.name, href: `/api/bcps/playbook-items?file=${rec.id}&n=${i}` })),
      })
    } catch (e) {
      await svc.from('bcps_playbook_completions').delete().eq('id', rec.id)
      return NextResponse.json({ error: (e as Error).message }, { status: 409 })
    }

    // Keep the previous version, then write only if nobody saved in between.
    const { data: rev, error: revErr } = await svc.from('bcps_doc_revisions')
      .insert({ slug, content: pb.content, replaced_by_email: auth.user.email }).select('id').single()
    const { data: saved, error } = revErr || !rev ? { data: null, error: revErr } : await svc.from('briefings')
      .update({ content: out.html, updated_at: new Date().toISOString() })
      .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).eq('updated_at', pb.updated_at).select('slug')
    if (error || !saved?.length) {
      await svc.from('bcps_playbook_completions').delete().eq('id', rec.id)
      return NextResponse.json({ error: 'The Playbook changed while you were working. Reload it and try again; your files are still uploaded.' }, { status: 409 })
    }
    await svc.from('bcps_playbook_completions').update({ revision_id: rev!.id, completed_lines: out.completed }).eq('id', rec.id)
    await svc.from('playbook_records').insert({
      slug, brand_slug: 'bcps', author: auth.user.email, kind: 'edit', source: 'complete', applied: true,
      body: `Completed by ${name}: ${out.completed.join(' / ')}.${files.length ? ` ${files.length} file${files.length === 1 ? '' : 's'} attached.` : ''} Previous content kept in bcps_doc_revisions ${rev!.id}.`,
    }).then(() => null, () => null)
    return NextResponse.json({ ok: true, completed: out.completed })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
