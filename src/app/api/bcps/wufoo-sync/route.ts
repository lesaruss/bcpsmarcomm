import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

// Wufoo feed for MarComm Assignments (Sean, 2026-10-19). New entries on the
// Wufoo MarComm Request form become New rows in bcps_marcomm_requests, with the
// Wufoo entry number as the job number. State, the field map and the 15-minute
// pg_cron backstop are in migration 20261019_bcps_marcomm_wufoo.sql.
//
// Callers:
//   Wufoo's webhook  form-encoded POST carrying HandshakeKey; it starts a sync
//   pg_cron / Logan  x-sync-key header (or ?key=) with action discover | sync | register_webhook | backfill_files
// Files on an entry are copied into the private marcomm-attachments bucket
// (Sean, 2026-10-22: there was no place to download them), so they show under
// Attachments on the request and outlive Wufoo. backfill_files does the same
// for entries imported before, whose files were only listed in the text.
// Nothing is imported until bcps_marcomm_wufoo_state.enabled is set, after the
// field map from discover has been checked against the form.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const WUFOO = 'https://browardschools.wufoo.com/api/v3'
const SELF = 'https://bcpsmarcomm.com/api/bcps/wufoo-sync'
const PAGE_SIZE = 25
const BUCKET = 'marcomm-attachments'

// Wufoo writes a file answer as "name.pdf (https://browardschools.wufoo.com/cabinet/...)".
function parseFile(answer: string): { name: string; url: string } | null {
  const m = answer.match(/^(.*?)\s*\((https:\/\/[^\s)]+)\)\s*$/)
  if (!m) return null
  return { name: (m[1] || m[2].split('/').pop() || 'file').trim(), url: m[2] }
}

// Copy one Wufoo file into our bucket. Cabinet links open for anyone with the
// link; the API key is tried if they do not. A file that cannot be copied
// keeps its Wufoo link, so it is still listed.
async function copyFile(job: number, f: { name: string; url: string }): Promise<{ name: string; path?: string; url?: string }> {
  try {
    const key = process.env.WUFOO_API_KEY
    let r = await fetch(f.url, { cache: 'no-store', redirect: 'follow' })
    if (!r.ok && key) r = await fetch(f.url, { cache: 'no-store', redirect: 'follow', headers: { Authorization: `Basic ${Buffer.from(`${key}:footastic`).toString('base64')}` } })
    const type = r.headers.get('content-type') || 'application/octet-stream'
    if (!r.ok || type.includes('text/html')) throw new Error(`Wufoo ${r.status}`)
    const safe = f.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file'
    const path = `requests/wufoo-${job}/${safe}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await r.arrayBuffer()), { contentType: type, upsert: true })
    if (error) throw new Error(error.message)
    return { name: f.name, path }
  } catch {
    return { name: f.name, url: f.url }
  }
}
const copyFiles = (job: number, answers: string[]) =>
  Promise.all(answers.map(parseFile).filter((f): f is { name: string; url: string } => !!f).map(f => copyFile(job, f)))

type WField = { ID: string; Title: string; Type: string; SubFields?: { ID: string; Label: string }[] }
type Field = { id: string; title: string; type: string; subfields: { id: string; label: string }[] }
type Entry = Record<string, string>
// Tracker column -> the Wufoo field ids that fill it.
type FieldMap = Partial<Record<
  'requester_name' | 'requester_title' | 'requester_email' | 'requester_phone' | 'org_type' | 'org_name' | 'description' | 'goal'
  | 'date_needed' | 'event_date' | 'is_becon' | 'calendar_needed' | 'services' | 'audiences' | 'files', string[]
>>

async function secret(key: string) {
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', key).maybeSingle()
  return data?.value || ''
}
function same(given: string, want: string) {
  return !!given && !!want && given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

async function wufoo<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.WUFOO_API_KEY
  if (!key) throw new Error('WUFOO_API_KEY is not set in Vercel.')
  // Wufoo's API takes the key as the Basic auth user; the password is ignored.
  const r = await fetch(`${WUFOO}${path}`, {
    ...init, cache: 'no-store',
    headers: { Authorization: `Basic ${Buffer.from(`${key}:footastic`).toString('base64')}`, ...(init.headers ?? {}) },
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`Wufoo ${r.status} on ${path.split('?')[0]}: ${text.slice(0, 200)}`)
  return JSON.parse(text) as T
}

const toField = (f: WField): Field => ({
  id: f.ID, title: f.Title, type: f.Type, subfields: (f.SubFields ?? []).map(s => ({ id: s.ID, label: s.Label })),
})

// A first guess from the field titles; checked by hand before enabling.
function guessMap(fields: Field[]): FieldMap {
  const map: FieldMap = {}
  const take = (col: keyof FieldMap, test: (f: Field) => boolean) => {
    const f = fields.find(x => test(x) && !Object.values(map).some(ids => ids?.includes(x.id)))
    if (f) map[col] = [f.id]
  }
  const t = (re: RegExp) => (f: Field) => re.test(f.title)
  take('requester_name', f => f.type === 'shortname' || /^(your )?(full )?name/i.test(f.title))
  take('requester_email', f => f.type === 'email')
  take('requester_phone', f => f.type === 'phone')
  take('requester_title', t(/title|position/i))
  take('org_name', t(/school|department|location|site/i))
  take('event_date', f => f.type === 'date' && /event/i.test(f.title))
  take('date_needed', f => f.type === 'date')
  take('is_becon', t(/becon/i))
  take('audiences', t(/audience/i))
  take('services', f => f.type === 'checkbox')
  take('goal', t(/goal|purpose|why|objective/i))
  take('description', f => f.type === 'textarea')
  map.files = fields.filter(f => f.type === 'file').map(f => f.id)
  return map
}

// One field's answer from an entry; checkboxes and names keep their parts.
function answer(f: Field, e: Entry): string[] {
  if (f.subfields.length) return f.subfields.map(s => (e[s.id] ?? '').trim()).filter(Boolean)
  const v = (e[f.id] ?? '').trim()
  return v ? [v] : []
}
function toDate(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null
}

function toRow(e: Entry, fields: Field[], map: FieldMap) {
  const byId = new Map(fields.map(f => [f.id, f]))
  const used = new Set(Object.values(map).flat())
  const get = (col: keyof FieldMap, sep = ' ') =>
    (map[col] ?? []).flatMap(id => { const f = byId.get(id); return f ? answer(f, e) : [] }).join(sep).trim() || null
  const list = (col: keyof FieldMap) =>
    (map[col] ?? []).flatMap(id => { const f = byId.get(id); return f ? answer(f, e) : [] })

  const files = list('files')
  // Answers with no tracker column are kept in the request text, labelled.
  const extra = fields.filter(f => !used.has(f.id) && f.type !== 'file')
    .map(f => ({ f, v: answer(f, e).join(', ') })).filter(x => x.v)
    // The question without its examples ("(e.g., a flyer, ...)"), 2026-10-22.
    .map(x => `${x.f.title.replace(/\s*\((?:e\.g\.|i\.e\.)[^)]*\)/gi, '').trim() || 'Link'}: ${x.v}`)
  // Files are copied to Attachments by sync, not listed in the text.
  const description = [get('description', '\n'), extra.join('\n')].filter(Boolean).join('\n\n') || null
  const firstLine = (get('description', ' ') ?? extra[0] ?? `Wufoo entry ${e.EntryId}`).replace(/\s+/g, ' ')
  // Yes/No checkboxes come back as the ticked label.
  const yes = (col: keyof FieldMap) => /^(y|true)/i.test(get(col) ?? '')
  const orgType = get('org_type')

  return {
    job_number: Number(e.EntryId),
    source: 'wufoo',
    title: firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine,
    requester_name: get('requester_name'),
    requester_title: get('requester_title'),
    requester_email: get('requester_email')?.toLowerCase() ?? null,
    requester_phone: get('requester_phone'),
    org_type: orgType === 'School' || orgType === 'Department' ? orgType : null,
    org_name: get('org_name'),
    services: list('services'),
    audiences: list('audiences'),
    description,
    goal: get('goal', '\n'),
    date_needed: toDate(get('date_needed') ?? undefined),
    event_date: toDate(get('event_date') ?? undefined),
    is_becon: yes('is_becon'),
    calendar_needed: yes('calendar_needed'),
    status: 'new',
    // Wufoo reports times in the account's zone, Eastern for the District.
    submitted_at: e.DateCreated ? `${e.DateCreated} America/New_York` : new Date().toISOString(),
    // Date submitted in the tracker (Sean, 2026-10-21): the Wufoo entry's own day.
    start_date: /^\d{4}-\d{2}-\d{2}/.test(e.DateCreated || '') ? e.DateCreated.slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    created_by_email: 'Wufoo',
    source_payload: e,
    files,
  }
}

async function loadState() {
  const { data, error } = await supabase.from('bcps_marcomm_wufoo_state').select('*').eq('id', 1).single()
  if (error) throw new Error(error.message)
  return data as {
    form_hash: string | null; fields: Field[] | null; field_map: FieldMap | null; last_entry_id: number | null; enabled: boolean
  }
}
const saveState = (patch: Record<string, unknown>) =>
  supabase.from('bcps_marcomm_wufoo_state').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)

async function discover(formHash: string | null) {
  const { Forms } = await wufoo<{ Forms: { Name: string; Hash: string }[] }>('/forms.json')
  const forms = Forms.map(f => ({ name: f.Name, hash: f.Hash }))
  const form = formHash ? forms.find(f => f.hash === formHash)
    : forms.find(f => /mar\s*-?\s*com/i.test(f.name) && /request/i.test(f.name)) ?? forms.find(f => /mar\s*-?\s*com/i.test(f.name))
  if (!form) {
    await saveState({ forms, discovered_at: new Date().toISOString(), last_error: 'No MarComm form found; pass ?form=<hash>.' })
    return { forms, form: null }
  }
  const { Fields } = await wufoo<{ Fields: WField[] }>(`/forms/${form.hash}/fields.json`)
  // Wufoo's own fields (EntryId, DateCreated, CreatedBy...) are not questions.
  const fields = Fields.filter(f => /^Field\d+$/.test(f.ID)).map(toField)
  const { Entries } = await wufoo<{ Entries: Entry[] }>(`/forms/${form.hash}/entries.json?sort=EntryId&sortDirection=DESC&pageSize=5`)
  const latest = Entries.map(e => ({ id: Number(e.EntryId), created: e.DateCreated }))
  const state = await loadState()
  const field_map = state.form_hash === form.hash && state.field_map ? state.field_map : guessMap(fields)
  await saveState({
    forms, form_hash: form.hash, form_name: form.name, fields, field_map, latest_entries: latest,
    discovered_at: new Date().toISOString(), last_error: null,
  })
  return { forms, form, fields: fields.map(f => `${f.id} ${f.type}: ${f.title}`), field_map, latest }
}

async function sync() {
  const state = await loadState()
  if (!state.enabled) return { enabled: false, imported: 0 }
  if (!state.form_hash || !state.fields || !state.field_map) throw new Error('Run discover first.')
  let after = state.last_entry_id ?? 0
  const imported: number[] = []
  const skipped: number[] = []
  for (let page = 0; page < 4; page++) {
    const q = `Filter1=${encodeURIComponent(`EntryId Is_greater_than ${after}`)}&sort=EntryId&sortDirection=ASC&pageSize=${PAGE_SIZE}`
    const { Entries } = await wufoo<{ Entries: Entry[] }>(`/forms/${state.form_hash}/entries.json?${q}`)
    for (const e of Entries) {
      const { files, ...row } = toRow(e, state.fields, state.field_map)
      const { data, error } = await supabase.from('bcps_marcomm_requests')
        .upsert(row, { onConflict: 'job_number', ignoreDuplicates: true }).select('id')
      if (error) throw new Error(`Entry ${e.EntryId}: ${error.message}`)
      if (data?.length) {
        imported.push(row.job_number)
        if (files.length) {
          const attachments = await copyFiles(row.job_number, files)
          if (attachments.length) await supabase.from('bcps_marcomm_requests').update({ attachments }).eq('id', data[0].id)
        }
        await supabase.from('bcps_marcomm_request_notes').insert({
          request_id: data[0].id, body: `Imported from Wufoo entry ${row.job_number}.`, author: 'Wufoo', source: 'system',
        })
      } else skipped.push(row.job_number)
      after = Math.max(after, row.job_number)
    }
    if (Entries.length < PAGE_SIZE) break
  }
  if (after > (state.last_entry_id ?? 0)) await supabase.rpc('bcps_marcomm_bump_job_seq', { p_job: after })
  const result = { imported, already_tracked: skipped, last_entry_id: after }
  await saveState({ last_entry_id: after, last_run_at: new Date().toISOString(), last_result: result, last_error: null })
  return result
}

// Entries imported before files were copied: their files sit in the text as
// "Files on Wufoo:" lines. Copy them to Attachments and take the lines out.
async function backfillFiles() {
  const { data: rows, error } = await supabase.from('bcps_marcomm_requests')
    .select('id, job_number, description, attachments').eq('source', 'wufoo').ilike('description', '%Files on Wufoo:%')
  if (error) throw new Error(error.message)
  const done: { job: number; copied: number; linked: number }[] = []
  for (const r of rows ?? []) {
    const text = String(r.description ?? '')
    const at = text.indexOf('Files on Wufoo:')
    const answers = text.slice(at + 'Files on Wufoo:'.length).split('\n').map(l => l.trim()).filter(Boolean)
    const attachments = await copyFiles(r.job_number as number, answers)
    if (!attachments.length) continue
    const kept = Array.isArray(r.attachments) ? r.attachments : []
    await supabase.from('bcps_marcomm_requests').update({
      attachments: [...kept, ...attachments], description: text.slice(0, at).trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    const copied = attachments.filter(a => a.path).length
    await supabase.from('bcps_marcomm_request_notes').insert({
      request_id: r.id, author: 'Wufoo', source: 'system',
      body: `Files from Wufoo moved to Attachments: ${attachments.map(a => a.name).join(', ')}.${copied < attachments.length ? ' Some could not be copied and still open on Wufoo.' : ''}`,
    })
    done.push({ job: r.job_number as number, copied, linked: attachments.length - copied })
  }
  return { backfilled: done }
}

async function registerWebhook() {
  const state = await loadState()
  if (!state.form_hash) throw new Error('Run discover first.')
  const body = new URLSearchParams({ url: SELF, handshakeKey: await secret('BCPS_WUFOO_HANDSHAKE'), metadata: 'false' })
  const res = await wufoo<{ WebHookPutResult?: { Hash?: string } }>(`/forms/${state.form_hash}/webhooks.json`, {
    method: 'PUT', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  await saveState({ webhook_hash: res.WebHookPutResult?.Hash ?? null })
  return { webhook: res.WebHookPutResult?.Hash ?? null }
}

async function handle(req: NextRequest, body: Record<string, string>) {
  // Wufoo's webhook: only the handshake is trusted; the entry itself is read
  // back from the API by sync, so a forged body cannot write a row.
  if (body.HandshakeKey !== undefined) {
    if (!same(body.HandshakeKey, await secret('BCPS_WUFOO_HANDSHAKE'))) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    try { return NextResponse.json(await sync()) } catch (e) { return fail(e) }
  }
  const given = req.headers.get('x-sync-key') || req.nextUrl.searchParams.get('key') || ''
  if (!same(given, await secret('BCPS_WUFOO_SYNC_KEY'))) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  const action = body.action || req.nextUrl.searchParams.get('action') || 'sync'
  try {
    if (action === 'discover') return NextResponse.json(await discover(body.form || req.nextUrl.searchParams.get('form')))
    if (action === 'register_webhook') return NextResponse.json(await registerWebhook())
    if (action === 'sync') return NextResponse.json(await sync())
    if (action === 'backfill_files') return NextResponse.json(await backfillFiles())
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (e) { return fail(e) }
}

async function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  await saveState({ last_run_at: new Date().toISOString(), last_error: msg.slice(0, 500) })
  return NextResponse.json({ error: msg }, { status: 500 })
}

export async function POST(req: NextRequest) {
  const type = req.headers.get('content-type') || ''
  let body: Record<string, string> = {}
  try {
    body = type.includes('application/json') ? await req.json()
      : Object.fromEntries(new URLSearchParams(await req.text()))
  } catch { body = {} }
  return handle(req, body)
}

export async function GET(req: NextRequest) {
  return handle(req, {})
}
