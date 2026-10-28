import { parse, HTMLElement } from 'node-html-parser'

// Meeting transcript -> the Playbook itself (V, 2026-10-28: "What I wanted it
// to do was to actually update the playbook using information from an
// uploaded transcript"). The upload used to file only a meeting-notes doc.
// Now Apply also writes the reviewed meeting into the Playbook as a new
// version: decisions into the decisions section, action items into the Work
// Queue, open questions into open issues, section updates where they belong,
// finished Work Queue items moved to Completed, the stage, a Latest meeting
// line in the lead, a Decision History entry and a link to the notes.
//
// Built for the BCPS document template (canon-bcps-doc-template-standard):
// version blocks (.ver-N with radios), closed doc-accordion sections, Work
// Queue tabs. A Playbook not yet on the template is updated in place, without
// a new version block. The caller keeps the previous content in
// bcps_doc_revisions, so every update can be rolled back.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()
const MAX_OUTLINE = 60_000

export function shortDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}
export function longDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

export const kids = (el: HTMLElement) => el.childNodes.filter((n): n is HTMLElement => n instanceof HTMLElement)

// The block a reader sees first: the checked version, else the highest
// numbered one, else <main>.
export function versionInfo(root: HTMLElement) {
  const main = root.querySelector('main')
  const blocks = root.querySelectorAll('div.ver').map((el) => ({ el, n: Number((/\bver-(\d+)\b/.exec(el.getAttribute('class') || '') || [])[1] || 0) })).filter((b) => b.n > 0)
  if (!blocks.length) return { main, current: main, n: 0, blocks }
  const checked = root.querySelectorAll('input.ver-radio').find((r) => r.hasAttribute('checked'))
  const want = Number((/^ver(\d+)$/.exec(checked?.getAttribute('id') || '') || [])[1] || 0)
  const pick = blocks.find((b) => b.n === want) ?? blocks.reduce((a, b) => (b.n > a.n ? b : a))
  return { main, current: pick.el, n: pick.n, blocks }
}

// Top-level sections of a block: closed accordions, or plain <h2> headings on
// a Playbook not yet on the template.
export function sections(block: HTMLElement): { title: string; el: HTMLElement; body: HTMLElement | null }[] {
  const acc = kids(block).filter((el) => el.tagName === 'DETAILS' && el.classList.contains('doc-accordion'))
  if (acc.length) {
    return acc.map((el) => ({
      title: (el.querySelector('summary')?.text || '').trim(),
      el,
      body: kids(el).find((c) => c.classList.contains('section-block') || c.classList.contains('tablist-wrap')) ?? null,
    }))
  }
  return kids(block).filter((el) => el.tagName === 'H2' && !el.classList.contains('lead-heading')).map((el) => ({ title: el.text.trim(), el, body: null }))
}

const itemTitles = (el: HTMLElement) =>
  el.querySelectorAll('.agenda-title, .action-title, .decision-title, .link-label, li').map((t) => t.text.replace(/\s+/g, ' ').trim()).filter(Boolean)

const pendingItems = (block: HTMLElement) => block.querySelectorAll('li.chk-item.pending').map((li) => li.text.replace(/\s+/g, ' ').trim())

export interface PlaybookOutline { text: string; sections: string[]; pending: string[]; stage: string }

// What Claude is shown: the current version's sections with their items, the
// pending Work Queue, the stage. Titles are quoted back on apply and matched
// by text, so a Playbook edited in between still lands in the right place.
export function playbookOutline(html: string): PlaybookOutline {
  const root = parse(html, { comment: true })
  const { current } = versionInfo(root)
  if (!current) return { text: '', sections: [], pending: [], stage: '' }
  const secs = sections(current)
  const stage = metaValue(current, 'Stage')
  const lead = current.querySelector('.lead-summary')?.structuredText.replace(/\s+/g, ' ').trim() || ''
  const parts = [`Stage: ${stage || '(none)'}`, `Lead section: ${lead}`, 'Sections:']
  for (const s of secs) {
    if (/^work queue$/i.test(s.title)) continue
    const items = itemTitles(s.body ?? s.el).slice(0, 40)
    parts.push(`- "${s.title}"${items.length ? '\n' + items.map((t) => `    * ${t.slice(0, 220)}`).join('\n') : ''}`)
  }
  const pending = pendingItems(current)
  parts.push('Work Queue, pending:', ...(pending.length ? pending.map((t) => `- "${t}"`) : ['(none)']))
  return { text: parts.join('\n').slice(0, MAX_OUTLINE), sections: secs.map((s) => s.title).filter((t) => !/^work queue$/i.test(t)), pending, stage }
}

function metaValue(block: HTMLElement, label: string): string {
  const item = block.querySelectorAll('.meta-item').find((m) => norm(m.querySelector('.meta-label')?.text || '') === label.toLowerCase())
  return item?.querySelector('.meta-value')?.text.replace(/\s+/g, ' ').trim() || ''
}

export interface PlaybookUpdate {
  meeting_label: string
  meeting_date: string
  summary: string
  decisions: string[]
  open_questions: string[]
  actions: { title: string; lead: string; support: string[]; deadline_date: string; owners?: string[] }[]
  section_updates: { section: string; new_section: boolean; title: string; detail: string }[]
  queue_done: string[]
  stage: string
  notes_path: string
  notes_title: string
}

const accordionHtml = (title: string, inner: string) =>
  `<details class="doc-accordion"><summary><h2>${esc(title)}</h2></summary><div class="section-block">${inner}</div></details>`
const agendaHtml = (title: string, detail: string, tag: string) =>
  `<div class="agenda-item"><div class="agenda-head"><span class="agenda-title">${esc(title)}</span><span class="agenda-time">${esc(tag)}</span></div>${detail ? `<div class="agenda-detail">${esc(detail)}</div>` : ''}</div>`

// Where a new section goes: before the Work Queue, Related Material and
// Decision History, so the reference sections stay last.
function insertSection(block: HTMLElement, html: string) {
  const anchor = sections(block).find((s) => /^(work queue|related|links)/i.test(s.title))?.el
    ?? kids(block).find((el) => el.tagName === 'DETAILS' && el.classList.contains('history'))
  if (anchor) anchor.insertAdjacentHTML('beforebegin', html)
  else block.insertAdjacentHTML('beforeend', html)
}

// The section to add to: an exact title match first, then the first title
// matching the pattern; created when there is none.
function sectionBody(block: HTMLElement, exact: string, pattern: RegExp | null, createTitle: string): HTMLElement {
  const find = () => {
    const secs = sections(block)
    return secs.find((s) => exact && norm(s.title) === norm(exact)) ?? (pattern ? secs.find((s) => pattern.test(s.title)) : undefined)
  }
  let s = find()
  if (!s || !s.body) {
    if (s && !s.body) {
      // A plain <h2> section on a Playbook not on the template: add right after it.
      s.el.insertAdjacentHTML('afterend', '<div class="section-block" data-meeting-updates></div>')
      return s.el.nextElementSibling as HTMLElement
    }
    insertSection(block, accordionHtml(createTitle, ''))
    s = sections(block).find((x) => norm(x.title) === norm(createTitle))
  }
  return s!.body!
}

export function setCount(el: HTMLElement | null, n: number) { if (el) el.set_content(String(n)) }

// Work Queue: new action items as a pending group, finished items moved to
// Completed. The Work Queue is created when the Playbook has none.
function updateQueue(block: HTMLElement, u: PlaybookUpdate, tag: string): { added: number; done: number } {
  if (!u.actions.length && !u.queue_done.length) return { added: 0, done: 0 }
  let wrap = sections(block).find((s) => /^work queue$/i.test(s.title))?.body
  if (!wrap) {
    insertSection(block, '<details class="doc-accordion"><summary><h2>Work Queue</h2></summary><div class="tablist-wrap">'
      + '<div class="tablist" role="tablist"><button class="tab-btn" role="tab" aria-selected="true" data-tab="pending">Pending <span class="count">0</span></button>'
      + '<button class="tab-btn" role="tab" aria-selected="false" data-tab="done">Completed <span class="count">0</span></button></div>'
      + '<div class="tabpanel" id="panel-pending" role="tabpanel"></div><div class="tabpanel" id="panel-done" hidden role="tabpanel"></div></div></details>')
    wrap = sections(block).find((s) => /^work queue$/i.test(s.title))!.body!
    ensureTabScript(block)
  }
  const pendingPanel = wrap.querySelector('#panel-pending')!
  const donePanel = wrap.querySelector('#panel-done')!

  let added = 0
  if (u.actions.length) {
    const li = u.actions.map((a) => {
      const who = [a.lead, ...a.support].filter(Boolean).join(', ')
      const when = a.deadline_date ? `, by ${shortDate(a.deadline_date)}` : ''
      const owners = a.owners?.length ? ` data-owners="${esc(a.owners.join(','))}"` : ''
      return `<li class="chk-item pending"${owners}><span class="chk-box"></span><span>${esc(a.title)}${who || when ? ` (${esc(who || 'no owner named')}${esc(when)})` : ''}</span></li>`
    }).join('')
    pendingPanel.querySelectorAll('details.held').forEach((d) => d.removeAttribute('open'))
    pendingPanel.insertAdjacentHTML('afterbegin', `<details class="held" open><summary>${esc(`From ${u.meeting_label}, ${tag}`)} <span class="grp-count">${u.actions.length}</span></summary><div class="body"><ul class="chk-list">${li}</ul></div></details>`)
    added = u.actions.length
  }

  let done = 0
  if (u.queue_done.length) {
    const wanted = new Set(u.queue_done.map(norm))
    let doneList = donePanel.querySelector('ul.chk-list')
    if (!doneList) {
      donePanel.insertAdjacentHTML('afterbegin', '<details class="done" open><summary>Completed <span class="grp-count">0</span></summary><div class="body"><ul class="chk-list"></ul></div></details>')
      doneList = donePanel.querySelector('ul.chk-list')!
    }
    for (const li of pendingPanel.querySelectorAll('li.chk-item.pending')) {
      if (!wanted.has(norm(li.text))) continue
      const text = li.querySelectorAll('span').pop()?.innerHTML || esc(li.text.trim())
      doneList.insertAdjacentHTML('afterbegin', `<li class="chk-item done"><span class="chk-box">&#10003;</span><span>${text} (done, ${esc(tag)})</span></li>`)
      li.remove()
      done++
    }
    // Groups left empty go; the counts follow what is on the page.
    for (const g of pendingPanel.querySelectorAll('details.held')) {
      const n = g.querySelectorAll('li.chk-item').length
      if (!n) g.remove()
      else setCount(g.querySelector('.grp-count'), n)
    }
    for (const g of donePanel.querySelectorAll('details.done')) setCount(g.querySelector('.grp-count'), g.querySelectorAll('li.chk-item').length)
  }
  setCount(wrap.querySelector('.tab-btn[data-tab="pending"] .count'), pendingPanel.querySelectorAll('li.chk-item').length)
  setCount(wrap.querySelector('.tab-btn[data-tab="done"] .count'), donePanel.querySelectorAll('li.chk-item').length)
  return { added, done }
}

function ensureTabScript(block: HTMLElement) {
  const body = block.closest('body')
  if (!body || body.querySelector('script')) return
  body.insertAdjacentHTML('beforeend', `<script>
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const root = btn.closest('.tablist-wrap') || document;
      root.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected','false'));
      root.querySelectorAll('.tabpanel').forEach(p => p.hidden = true);
      btn.setAttribute('aria-selected','true');
      root.querySelector('#panel-' + btn.dataset.tab).hidden = false;
    });
  });
</script>`)
}

// Copies the current version block into v(N+1), marks it current in every
// version menu and checks its radio. Returns the new block.
function newVersion(root: HTMLElement, current: HTMLElement, n: number, label: string, desc: string): HTMLElement {
  const next = n + 1
  current.insertAdjacentHTML('beforebegin', `<!-- VERSION ${next} (CURRENT) -->\n` + current.toString() + '\n\n')
  const block = root.querySelectorAll('div.ver').find((el) => el.classList.contains(`ver-${n}`))!
  block.setAttribute('class', `ver ver-${next}`)

  const radios = root.querySelectorAll('input.ver-radio')
  radios.forEach((r) => r.removeAttribute('checked'))
  const first = radios[0]
  if (first) first.insertAdjacentHTML('beforebegin', `<input class="ver-radio" type="radio" name="docver" id="ver${next}" checked>\n`)

  for (const menu of root.querySelectorAll('.ver-menu')) {
    for (const l of menu.querySelectorAll('label')) {
      l.classList.remove('is-current')
      l.querySelectorAll('.current-badge').forEach((b) => b.remove())
    }
    menu.insertAdjacentHTML('afterbegin', `<label for="ver${next}"${menu.closest('div.ver') === block ? ' class="is-current"' : ''}><span class="vlabel">v${next} &#183; ${esc(label)}${menu.closest('div.ver') === block ? '<span class="current-badge">&#10003; Current</span>' : ''}</span><span class="vdesc">${esc(desc)}</span></label>`)
  }
  const cur = block.querySelector('details.ver-dd-inline .cur')
  if (cur) cur.set_content(`v${next} &#183; ${esc(label)}`)

  // The template's CSS shows versions 1 to 9; add the rule past that.
  if (next > 9) {
    const head = root.querySelector('head')
    if (head && !head.toString().includes(`#ver${next}:checked`)) {
      head.insertAdjacentHTML('beforeend', `<style>#ver${next}:checked ~ .ver-content .ver-${next} { display: block; }</style>`)
    }
  }
  return block
}

export function applyPlaybookUpdate(html: string, u: PlaybookUpdate): { html: string; version: number | null; counts: Record<string, number> } {
  const root = parse(html, { comment: true })
  const info = versionInfo(root)
  if (!info.current) throw new Error('This Playbook has no content to update.')
  const tag = shortDate(u.meeting_date)
  const desc = `Updated from the ${u.meeting_label} transcript (${longDate(u.meeting_date)}).`
  const block = info.n ? newVersion(root, info.current, info.n, tag, desc) : info.current
  const version = info.n ? info.n + 1 : null

  // Stage, when the meeting changed it.
  if (u.stage) {
    const item = block.querySelectorAll('.meta-item').find((m) => norm(m.querySelector('.meta-label')?.text || '') === 'stage')
    if (item) item.querySelector('.meta-value')?.set_content(esc(u.stage))
    else {
      const ver = block.querySelectorAll('.meta-item').find((m) => norm(m.querySelector('.meta-label')?.text || '') === 'version')
      const html = `<div class="meta-item"><span class="meta-label">Stage</span><span class="meta-value">${esc(u.stage)}</span></div>`
      if (ver) ver.insertAdjacentHTML('beforebegin', html)
      else block.querySelector('.meta-row')?.insertAdjacentHTML('beforeend', html)
    }
  }

  // Latest meeting line in the lead section, replacing the previous one.
  if (u.summary) {
    const lead = block.querySelector('.lead-summary')
    lead?.querySelectorAll('[data-latest-meeting]').forEach((p) => p.remove())
    lead?.insertAdjacentHTML('beforeend', `<p data-latest-meeting><strong>Latest meeting (${esc(longDate(u.meeting_date))}):</strong> ${esc(u.summary)}</p>`)
  }

  const counts: Record<string, number> = { decisions: 0, questions: 0, sections: 0, added: 0, done: 0 }
  if (u.decisions.length) {
    const body = sectionBody(block, '', /decision/i, 'Key Decisions')
    body.insertAdjacentHTML('afterbegin', u.decisions.map((d) => agendaHtml(d, '', tag)).join(''))
    counts.decisions = u.decisions.length
  }
  if (u.open_questions.length) {
    const body = sectionBody(block, '', /^open (issues|questions)/i, 'Open Questions')
    body.insertAdjacentHTML('afterbegin', u.open_questions.map((q) => agendaHtml(q, '', `Open, ${tag}`)).join(''))
    counts.questions = u.open_questions.length
  }
  for (const s of u.section_updates) {
    const body = sectionBody(block, s.section, null, s.section)
    body.insertAdjacentHTML('afterbegin', agendaHtml(s.title, s.detail, tag))
    counts.sections++
  }
  const q = updateQueue(block, u, tag)
  counts.added = q.added
  counts.done = q.done

  if (u.notes_path) {
    const body = sectionBody(block, '', /^(related|links)/i, 'Related Material')
    body.insertAdjacentHTML('afterbegin', `<div class="link-block"><div class="link-label">${esc(u.notes_title)}</div><div class="link-url"><a href="https://bcpsmarcomm.com${esc(u.notes_path)}" target="_blank" rel="noopener">bcpsmarcomm.com${esc(u.notes_path)}</a></div><div class="link-note">Meeting notes, filed from the transcript upload.</div></div>`)
  }

  // Decision History entry, newest first.
  let hist = kids(block).find((el) => el.tagName === 'DETAILS' && el.classList.contains('history'))
  if (!hist) {
    block.insertAdjacentHTML('beforeend', '<details class="history"><summary>Decision History</summary><div class="body"></div></details>')
    hist = kids(block).find((el) => el.tagName === 'DETAILS' && el.classList.contains('history'))!
  }
  const what = [
    counts.decisions && `${counts.decisions} decision${counts.decisions === 1 ? '' : 's'}`,
    counts.added && `${counts.added} action item${counts.added === 1 ? '' : 's'} in the Work Queue`,
    counts.done && `${counts.done} Work Queue item${counts.done === 1 ? '' : 's'} marked done`,
    counts.questions && `${counts.questions} open question${counts.questions === 1 ? '' : 's'}`,
    counts.sections && `${counts.sections} section update${counts.sections === 1 ? '' : 's'}`,
    u.stage && 'the stage',
  ].filter(Boolean).join(', ')
  const histBody = kids(hist).find((el) => el.classList.contains('body')) ?? hist
  histBody.insertAdjacentHTML('afterbegin', `<h2>${esc(longDate(u.meeting_date))}${version ? ` (v${version})` : ''}</h2><p>${esc(`${version ? `v${version}: ` : ''}${u.meeting_label}, from the meeting transcript. ${u.summary}${what ? ` Added: ${what}.` : ''}`)}</p>`)

  return { html: root.toString(), version, counts }
}
