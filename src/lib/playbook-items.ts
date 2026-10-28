import { parse, HTMLElement } from 'node-html-parser'
import { versionInfo, sections, setCount, longDate, recountStatus } from '@/lib/playbook-update'

// Complete a Playbook item from the document itself (V, 2026-10-28): the
// person who owns a Work Queue or Action Items entry, or a superadmin, gets a
// Complete button beside it, writes a response and attaches files, and the
// item moves to Completed with the response and links. An Action Items entry
// and the Work Queue line for the same work are completed together.
//
// Deliverables Shelf (BCPS Document System, Phase 3, V 2026-10-28): a lead
// adds one slot per deliverable (title, owner, due date); the owner turns it
// in the same way, and the slot shows what was turned in. The Shelf reads
// Draft while any slot is waiting and Done when every slot is filled.
//
// Items are found in the version a reader sees first (the checked version
// block), the same one the transcript upload updates. Completing does not add
// a version; the caller keeps the previous content in bcps_doc_revisions.

export type ItemKind = 'queue' | 'action' | 'deliverable'
export interface PlaybookItem { kind: ItemKind; key: string; text: string; ownerText: string; owners: string[] }
export interface Recipient { name: string; email: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "(Vanessa, Tricia)" at the end of a Work Queue line.
function trailingOwner(text: string): string {
  const m = /\(([^()]*)\)\s*$/.exec(text.trim())
  return m ? m[1] : ''
}

// Owner text -> recipient emails. Names are matched to the Playbook's own
// readers: a full name, or a first or last name that only one reader has.
// Words like "team" or "regional leadership" name nobody, so those items are
// a superadmin's to complete.
export function resolveOwners(ownerText: string, recipients: Recipient[]): string[] {
  const people = recipients.map((r) => ({
    email: r.email.toLowerCase(),
    words: norm(r.name.replace(/-/g, ' ')).replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 1),
  }))
  const out = new Set<string>()
  for (const raw of ownerText.split(/,|\/|;|&|\band\b|\bwith\b/i)) {
    const words = norm(raw.replace(/\bDr\.?\s+/gi, '').replace(/-/g, ' ')).replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 1)
    if (!words.length) continue
    const full = people.filter((p) => words.length > 1 && p.words[0] === words[0] && p.words.includes(words[words.length - 1]))
    if (full.length) { full.forEach((p) => out.add(p.email)); continue }
    if (words.length === 1) {
      const one = people.filter((p) => p.words[0] === words[0] || p.words[p.words.length - 1] === words[0])
      if (one.length === 1) out.add(one[0].email)
    }
  }
  return Array.from(out)
}

function current(root: HTMLElement) {
  const info = versionInfo(root)
  return info.current
}

export function listItems(html: string, recipients: Recipient[]): PlaybookItem[] {
  const block = current(parse(html, { comment: true }))
  if (!block) return []
  const items: PlaybookItem[] = []
  for (const li of block.querySelectorAll('li.chk-item.pending')) {
    const text = li.text.replace(/\s+/g, ' ').trim()
    const stored = (li.getAttribute('data-owners') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    const ownerText = trailingOwner(text)
    items.push({ kind: 'queue', key: norm(text), text, ownerText, owners: stored.length ? stored : resolveOwners(ownerText, recipients) })
  }
  for (const s of sections(block)) {
    if (!/action items/i.test(s.title) || !s.body) continue
    for (const a of s.body.querySelectorAll('.action-item')) {
      if (a.querySelector('.action-done')) continue
      const title = a.querySelector('.action-title')?.text.replace(/\s+/g, ' ').trim() || ''
      if (!title) continue
      const ownerText = (a.querySelector('.action-owner')?.text || '').replace(/^\s*owners?:\s*/i, '').trim()
      items.push({ kind: 'action', key: norm(title), text: title, ownerText, owners: resolveOwners(ownerText, recipients) })
    }
  }
  for (const slot of block.querySelectorAll('.deliverable-slot')) {
    if (slot.classList.contains('filled')) continue
    const title = (slot.querySelector('.ds-title')?.text || '').replace(/\s+/g, ' ').trim()
    if (!title) continue
    const owners = (slot.getAttribute('data-owners') || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    items.push({ kind: 'deliverable', key: norm(title), text: title, ownerText: slot.getAttribute('data-owner-name') || '', owners })
  }
  return items
}

// Same work under two headings: most of the shorter line's words appear in
// the longer one.
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'their', 'have', 'will', 'team', 'about'])
const words = (s: string) => new Set(norm(s.replace(/\([^()]*\)\s*$/, '')).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)))
function sameWork(a: string, b: string): boolean {
  const x = words(a), y = words(b)
  const [small, big] = x.size <= y.size ? [x, y] : [y, x]
  if (small.size < 3) return false
  let hit = 0
  small.forEach((w) => { if (big.has(w)) hit++ })
  return hit / small.size >= 0.7
}

export interface Completion {
  kind: ItemKind
  key: string
  by: string
  date: string
  response: string
  files: { name: string; href: string }[]
}

const CSS_ID = 'bcps-completion-css'
const CSS = `<style id="${CSS_ID}">
  .chk-response, .action-done { display: block; font-size: 12px; line-height: 1.55; color: var(--text-75, rgba(26,26,26,.78)); margin-top: 4px; }
  .action-done { margin-top: 8px; padding: 8px 12px; border-left: 3px solid var(--bcps-green, #16750C); background: rgba(22,117,12,0.06); border-radius: 0 6px 6px 0; }
  .action-done strong { color: var(--bcps-green, #16750C); }
  .chk-files, .action-files { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px; }
  .chk-files a, .action-files a { color: var(--bcps-blue-dark, #0e4e73); font-weight: 700; text-decoration: underline; font-size: 12px; }
</style>`

function filesHtml(files: Completion['files'], cls: string) {
  return files.length ? `<span class="${cls}">${files.map((f) => `<a href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join('')}</span>` : ''
}

function completeQueue(block: HTMLElement, li: HTMLElement, c: Completion) {
  const wrap = li.closest('.tablist-wrap')
  const donePanel = wrap?.querySelector('#panel-done')
  if (!wrap || !donePanel) return
  let list = donePanel.querySelector('ul.chk-list')
  if (!list) {
    donePanel.insertAdjacentHTML('afterbegin', '<details class="done" open><summary>Completed <span class="grp-count">0</span></summary><div class="body"><ul class="chk-list"></ul></div></details>')
    list = donePanel.querySelector('ul.chk-list')!
  }
  const label = li.querySelectorAll('span').pop()?.innerHTML || esc(li.text.trim())
  const note = c.response ? `<span class="chk-response">${esc(c.response)}</span>` : ''
  list.insertAdjacentHTML('afterbegin', `<li class="chk-item done"><span class="chk-box">&#10003;</span><span>${label} (done ${esc(longDate(c.date))}, ${esc(c.by)})${note}${filesHtml(c.files, 'chk-files')}</span></li>`)
  const group = li.closest('details.held')
  li.remove()
  if (group) {
    const n = group.querySelectorAll('li.chk-item').length
    if (!n) group.remove()
    else setCount(group.querySelector('.grp-count'), n)
  }
  const pending = wrap.querySelector('#panel-pending')
  for (const g of donePanel.querySelectorAll('details.done')) setCount(g.querySelector('.grp-count'), g.querySelectorAll('li.chk-item').length)
  setCount(wrap.querySelector('.tab-btn[data-tab="pending"] .count'), pending?.querySelectorAll('li.chk-item').length ?? 0)
  setCount(wrap.querySelector('.tab-btn[data-tab="done"] .count'), donePanel.querySelectorAll('li.chk-item').length)
}

function completeAction(a: HTMLElement, c: Completion) {
  const body = a.querySelector('.action-body') ?? a
  const note = c.response ? ` ${esc(c.response)}` : ''
  body.insertAdjacentHTML('beforeend', `<div class="action-done"><strong>Done ${esc(longDate(c.date))}, ${esc(c.by)}.</strong>${note}${filesHtml(c.files, 'action-files')}</div>`)
}

// Marks the item done, and its twin under the other heading. Returns the new
// HTML and the text of every line it completed.
export function completeItem(html: string, c: Completion): { html: string; completed: string[] } {
  const root = parse(html, { comment: true })
  const block = current(root)
  if (!block) throw new Error('This Playbook has no content to update.')
  const queue = block.querySelectorAll('li.chk-item.pending')
  const actions = sections(block).filter((s) => /action items/i.test(s.title) && s.body)
    .flatMap((s) => s.body!.querySelectorAll('.action-item')).filter((a) => !a.querySelector('.action-done'))
  const actionTitle = (a: HTMLElement) => a.querySelector('.action-title')?.text.replace(/\s+/g, ' ').trim() || ''

  const completed: string[] = []
  let text = ''
  if (c.kind === 'deliverable') {
    const slot = block.querySelectorAll('.deliverable-slot').find((x) => !x.classList.contains('filled') && norm(x.querySelector('.ds-title')?.text || '') === c.key)
    if (!slot) throw new Error('That deliverable is no longer open on this Playbook.')
    text = (slot.querySelector('.ds-title')?.text || '').replace(/\s+/g, ' ').trim()
    slot.classList.add('filled')
    const tag = slot.querySelector('.ds-head .tag')
    if (tag) tag.set_content('Turned in')
    const note = c.response ? ` ${esc(c.response)}` : ''
    slot.insertAdjacentHTML('beforeend', `<div class="action-done"><strong>Turned in ${esc(longDate(c.date))}, ${esc(c.by)}.</strong>${note}${filesHtml(c.files, 'action-files')}</div>`)
    completed.push(text)
    shelfStatus(block)
  } else if (c.kind === 'queue') {
    const li = queue.find((x) => norm(x.text) === c.key)
    if (!li) throw new Error('That item is no longer open on this Playbook.')
    text = li.text.replace(/\s+/g, ' ').trim()
    completeQueue(block, li, c); completed.push(text)
    const twin = actions.find((a) => sameWork(actionTitle(a), text))
    if (twin) { completeAction(twin, c); completed.push(actionTitle(twin)) }
  } else {
    const a = actions.find((x) => norm(actionTitle(x)) === c.key)
    if (!a) throw new Error('That item is no longer open on this Playbook.')
    text = actionTitle(a)
    completeAction(a, c); completed.push(text)
    const twin = queue.find((li) => sameWork(li.text, text))
    if (twin) { const t = twin.text.replace(/\s+/g, ' ').trim(); completeQueue(block, twin, c); completed.push(t) }
  }

  const head = root.querySelector('head')
  if (head && !head.querySelector(`#${CSS_ID}`)) head.insertAdjacentHTML('beforeend', CSS)
  return { html: root.toString(), completed }
}

const SHELF_TITLE = /^deliverables shelf$/i
const SHELF_CSS_ID = 'bcps-deliverable-css'
const SHELF_CSS = `<style id="${SHELF_CSS_ID}">
  .deliverable-slot { border: 1px solid var(--border, rgba(0,0,0,0.12)); border-radius: 6px; padding: 12px 16px; margin: 0 0 10px; background: #fff; }
  .deliverable-slot .ds-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
  .deliverable-slot .ds-title { font-size: 14px; font-weight: 800; color: var(--text, #1a1a1a); }
  .deliverable-slot .ds-meta { font-size: 12px; color: var(--text-50, rgba(26,26,26,0.6)); margin-top: 4px; }
  .deliverable-slot.filled { border-color: rgba(22,117,12,0.35); }
  .deliverable-slot.filled .tag { color: var(--bcps-green, #16750C); border-color: var(--bcps-green, #16750C); }
</style>`

// The Shelf's status: Done when it has slots and every one is filled, else Draft.
function shelfStatus(block: HTMLElement) {
  const shelf = sections(block).find((s) => SHELF_TITLE.test(s.title))
  if (!shelf) return
  const slots = shelf.el.querySelectorAll('.deliverable-slot')
  const tag = shelf.el.querySelector('summary .status-tag')
  if (tag && slots.length) {
    const done = slots.every((x) => x.classList.contains('filled'))
    tag.set_content(done ? 'Done' : 'Draft')
    tag.setAttribute('class', done ? 'status-tag done' : 'status-tag')
  }
  recountStatus(block)
}

export interface Slot { title: string; ownerName: string; ownerEmail: string; due: string }

// Adds a slot to the Deliverables Shelf. The Shelf's Missing note goes once
// it has a slot; anything already on the Shelf (links, notes) stays.
export function addDeliverableSlot(html: string, slot: Slot): string {
  const root = parse(html, { comment: true })
  const block = current(root)
  if (!block) throw new Error('This Playbook has no content to update.')
  const shelf = sections(block).find((s) => SHELF_TITLE.test(s.title))
  if (!shelf?.body) throw new Error('This Playbook has no Deliverables Shelf.')
  const key = norm(slot.title)
  if (shelf.body.querySelectorAll('.deliverable-slot .ds-title').some((t) => norm(t.text) === key)) throw new Error('The Shelf already has a deliverable with that name.')
  shelf.body.querySelectorAll('.missing-note').forEach((n) => n.remove())
  shelf.body.insertAdjacentHTML('beforeend', `<div class="deliverable-slot" data-owners="${esc(slot.ownerEmail.toLowerCase())}" data-owner-name="${esc(slot.ownerName)}">`
    + `<div class="ds-head"><span class="ds-title">${esc(slot.title)}</span><span class="tag">Waiting</span></div>`
    + `<div class="ds-meta">Owner: ${esc(slot.ownerName)}.${slot.due ? ` Due ${esc(longDate(slot.due))}.` : ''}</div></div>`)
  shelfStatus(block)
  const head = root.querySelector('head')
  if (head && !head.querySelector(`#${SHELF_CSS_ID}`)) head.insertAdjacentHTML('beforeend', SHELF_CSS)
  if (head && !head.querySelector(`#${CSS_ID}`)) head.insertAdjacentHTML('beforeend', CSS)
  return root.toString()
}

// True when the Playbook in view has a Deliverables Shelf to add slots to.
export function hasShelf(html: string): boolean {
  const block = current(parse(html, { comment: true }))
  return !!block && sections(block).some((s) => SHELF_TITLE.test(s.title) && !!s.body)
}
