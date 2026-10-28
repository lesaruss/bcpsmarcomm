import { parse, HTMLElement } from 'node-html-parser'
import { versionInfo, sections, groupsOf, eyebrow, kids, longDate, recountStatus } from '@/lib/playbook-update'

// Team input on a Playbook (V, 2026-10-28: "where can the team add their
// thoughts, answer questions, interact with the document?"). Any reader can
// answer an open question, add to a Missing or Draft section, or add general
// input. It goes on the page straight away, labeled as team input and not yet
// confirmed; a lead accepts it (it becomes part of the section) or dismisses
// it (it leaves the page; the record stays in bcps_playbook_inputs).

export type InputKind = 'question' | 'section' | 'general'
export interface InputTarget { kind: InputKind; key: string; text: string }

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const QUESTIONS = /^open (questions|issues)$/i
export const GENERAL_KEY = 'general'

function statusOf(el: HTMLElement) { return (el.querySelector('summary .status-tag')?.text || '').trim() }

// Open questions (each item under Open Questions) and every Missing or Draft
// section, in the version a reader sees first.
export function listTargets(html: string): InputTarget[] {
  const block = versionInfo(parse(html, { comment: true })).current
  if (!block) return []
  const out: InputTarget[] = []
  for (const s of sections(block)) {
    if (QUESTIONS.test(s.title) && s.body) {
      for (const t of s.body.querySelectorAll('.agenda-item .agenda-title')) {
        const text = t.text.replace(/\s+/g, ' ').trim()
        if (text) out.push({ kind: 'question', key: norm(text), text })
      }
    }
    if (/missing|draft/i.test(statusOf(s.el))) out.push({ kind: 'section', key: norm(s.title), text: s.title })
  }
  out.push({ kind: 'general', key: GENERAL_KEY, text: 'General input on this page' })
  return out
}

const CSS_ID = 'bcps-team-input-css'
const CSS = `<style id="${CSS_ID}">
  .team-input { margin: 10px 0 0; padding: 8px 12px; border: 1px dashed var(--bcps-blue, #1672A7); border-radius: 6px; background: rgba(22,114,167,0.04); font-size: 13px; line-height: 1.55; color: var(--text-75, rgba(26,26,26,.78)); }
  .team-input .ti-who { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--bcps-blue-dark, #0e4e73); margin-bottom: 2px; }
  .team-input.confirmed { border-style: solid; border-color: var(--bcps-green, #16750C); background: rgba(22,117,12,0.05); }
  .team-input.confirmed .ti-who { color: var(--bcps-green, #16750C); }
  .ti-files { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px; }
  .ti-files a { color: var(--bcps-blue-dark, #0e4e73); font-weight: 700; text-decoration: underline; font-size: 12px; }
</style>`

export interface InputEntry { id: string; kind: InputKind; key: string; by: string; date: string; text: string; files: { name: string; href: string }[] }

function inputHtml(e: InputEntry) {
  const files = e.files.length ? `<span class="ti-files">${e.files.map((f) => `<a href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.name)}</a>`).join('')}</span>` : ''
  return `<div class="team-input" data-input-id="${esc(e.id)}"><span class="ti-who">Team input from ${esc(e.by)}, ${esc(longDate(e.date))}. Not yet confirmed.</span>${esc(e.text)}${files}</div>`
}

// General input collects in a Team Input section in Questions and Risks (or
// at the end of the page when it has no groups).
function teamInputBody(block: HTMLElement): HTMLElement {
  const existing = sections(block).find((s) => /^team input$/i.test(s.title))
  if (existing?.body) return existing.body
  const groups = groupsOf(block)
  const html = `<details class="doc-accordion"><summary><h${groups.length ? 3 : 2}>Team Input</h${groups.length ? 3 : 2}></summary><div class="section-block"><p class="block-intro">Thoughts, ideas and files from anyone on the team. The project lead confirms what goes into the plan.</p></div></details>`
  const g = groups.find((x) => /question/i.test(eyebrow(x))) ?? groups.find((x) => /to-do/i.test(eyebrow(x)))
  if (g) g.insertAdjacentHTML('beforeend', html)
  else {
    const hist = kids(block).find((el) => el.tagName === 'DETAILS' && el.classList.contains('history'))
    if (hist) hist.insertAdjacentHTML('beforebegin', html)
    else block.insertAdjacentHTML('beforeend', html)
  }
  return sections(block).find((s) => /^team input$/i.test(s.title))!.body!
}

function withCss(root: HTMLElement) {
  const head = root.querySelector('head')
  if (head && !head.querySelector(`#${CSS_ID}`)) head.insertAdjacentHTML('beforeend', CSS)
}

export function addInput(html: string, e: InputEntry): string {
  const root = parse(html, { comment: true })
  const block = versionInfo(root).current
  if (!block) throw new Error('This Playbook has no content to add to.')
  if (e.kind === 'question') {
    const item = sections(block).filter((s) => QUESTIONS.test(s.title) && s.body)
      .flatMap((s) => s.body!.querySelectorAll('.agenda-item'))
      .find((a) => norm(a.querySelector('.agenda-title')?.text || '') === e.key)
    if (!item) throw new Error('That question is no longer on this Playbook.')
    item.insertAdjacentHTML('beforeend', inputHtml(e))
  } else if (e.kind === 'section') {
    const s = sections(block).find((x) => norm(x.title) === e.key)
    if (!s?.body) throw new Error('That section is no longer on this Playbook.')
    s.body.insertAdjacentHTML('beforeend', inputHtml(e))
  } else {
    teamInputBody(block).insertAdjacentHTML('beforeend', inputHtml(e))
  }
  withCss(root)
  return root.toString()
}

// Accept: the input becomes part of the page. In a Missing section the
// placeholder goes and the section reads Draft until a person marks it Done;
// an answered question is tagged Answered. Dismiss: it leaves the page.
export function decideInput(html: string, id: string, decision: 'accept' | 'dismiss', by: string, date: string): string {
  const root = parse(html, { comment: true })
  const block = versionInfo(root).current
  const el = block?.querySelectorAll('.team-input').find((x) => x.getAttribute('data-input-id') === id)
  if (!el) throw new Error('That input is no longer on this Playbook.')
  if (decision === 'dismiss') { el.remove(); return root.toString() }
  el.classList.add('confirmed')
  const who = el.querySelector('.ti-who')
  if (who) who.set_content(esc(who.text.replace(/\s*Not yet confirmed\.\s*$/, '').replace(/^Team input from/, 'From')) + ` Confirmed by ${esc(by)}, ${esc(longDate(date))}.`)
  const item = el.closest('.agenda-item')
  if (item && !item.querySelector('.agenda-head .tag-answered')) item.querySelector('.agenda-head')?.insertAdjacentHTML('beforeend', '<span class="tag tag-answered">Answered</span>')
  const section = el.closest('details.doc-accordion')
  if (section && !item) {
    section.querySelectorAll('.missing-note').forEach((n) => n.remove())
    const tag = section.querySelector('summary .status-tag')
    if (tag && /missing/i.test(tag.text)) { tag.set_content('Draft'); tag.setAttribute('class', 'status-tag') }
  }
  if (block) recountStatus(block)
  return root.toString()
}
