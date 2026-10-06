// lib/dept-audit.ts
//
// Department page audit, v2 (Sean, 2026-10-06 Hot Lab). Replaces the
// layout/content/nav half of run-audit, which was generated with
// Math.random() and produced findings WCMs could not act on ("broken layout
// container overflow"). Two halves, equal weight:
//
//   Marketing:      12 real checks of what a visitor needs from a department
//                   page, each one something a WCM controls in Composer.
//   Accessibility:  the real axe-core scan, counting only rules the WCM owns
//                   (lib/ada-glossary owner 'wcm' or 'depends'). Rules
//                   Finalsite owns are listed, never scored against the WCM.
//
// This file is the single source for both the audit and the "Score 100"
// checklist (/playbooks/wcm-department/score-100-checklist, a briefings
// record generated from MARKETING_CHECKS and the WCM-owned glossary entries):
// every check carries its own why, its Composer fix steps and its weight, so
// a WCM who follows the checklist scores 100 by construction. Change a check
// here, regenerate that doc. Anchors on the doc are the check ids and
// a11y-<axe id>; the department page links each issue to them.
//
// Basis: WCAG 2.1 AA (the DOJ ADA Title II web rule's standard for public
// school districts); Digital.gov and state plain-language guidance (aim for
// a 6th to 8th grade reading level, short sections, descriptive links);
// district department-page guides (a short purpose statement and visible
// contact information on every department landing page).

import { lookupAxeEntry, type GlossaryEntry } from './ada-glossary'

export const AUDIT_VERSION = 2

// ── Facts collected from the rendered page ──────────────────────────────
export interface PageFacts {
  url: string
  title: string
  metaDescription: string
  h1Texts: string[]
  sectionHeadings: number      // h2 + h3 inside the main content
  firstParagraphWords: number  // longest paragraph among the first three in main content
  mainText: string             // visible text of the main content
  mainWordCount: number
  hasPhone: boolean
  hasEmail: boolean
  vagueLinks: string[]         // link texts like "click here"
  mainLinks: { href: string; text: string }[]
  pdfLinkCount: number
  horizontalOverflowAt375: boolean
}

// Runs inside the page (puppeteer page.evaluate). Must be self-contained.
export const COLLECT_FACTS_SCRIPT = `(() => {
  const pick = (sels) => { for (const s of sels) { const el = document.querySelector(s); if (el) return el } return null }
  // Finalsite Composer puts page content in #fsPageContent; fall back to
  // main/[role=main], then the body minus header, nav and footer.
  let main = pick(['#fsPageContent', 'main', '[role="main"]', '#fsPageBodyWrapper'])
  let clone
  if (main) { clone = main.cloneNode(true) } else { clone = document.body.cloneNode(true) }
  clone.querySelectorAll('script,style,noscript,header,nav,footer,#fsHeader,#fsFooter,#fsMenu,.fsNavigation,[role="navigation"]').forEach(n => n.remove())
  const text = (clone.innerText || clone.textContent || '').replace(/\\s+/g, ' ').trim()
  const scope = main || document.body
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const inChrome = (el) => !!el.closest('header,nav,footer,#fsHeader,#fsFooter,#fsMenu,.fsNavigation,[role="navigation"]')
  const paras = Array.from(scope.querySelectorAll('p')).filter(p => visible(p) && !inChrome(p)).map(p => (p.innerText || '').trim()).filter(t => t.length > 0)
  const words = (t) => t.split(/\\s+/).filter(Boolean).length
  const links = Array.from(scope.querySelectorAll('a[href]')).filter(a => !inChrome(a) && visible(a))
  const mainLinks = links.map(a => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() }))
  const vague = /^(click here|here|read more|more|learn more|link|this link|click|more info|info)$/i
  const h1Texts = Array.from(document.querySelectorAll('h1')).filter(visible).map(h => (h.innerText || '').trim()).filter(Boolean)
  const sectionHeadings = Array.from(scope.querySelectorAll('h2,h3')).filter(h => visible(h) && !inChrome(h)).length
  const meta = document.querySelector('meta[name="description"]')
  return {
    url: location.href,
    title: document.title || '',
    metaDescription: meta ? (meta.getAttribute('content') || '').trim() : '',
    h1Texts,
    sectionHeadings,
    firstParagraphWords: Math.max(0, ...paras.slice(0, 3).map(words)),
    mainText: text.slice(0, 20000),
    mainWordCount: words(text),
    hasPhone: links.some(a => a.href.startsWith('tel:')) || /\\(?\\b\\d{3}\\)?[\\s.-]\\d{3}[\\s.-]\\d{4}\\b/.test(text),
    hasEmail: links.some(a => a.href.startsWith('mailto:')) || /[\\w.+-]+@[\\w-]+\\.[\\w.]+/.test(text),
    vagueLinks: mainLinks.filter(l => vague.test(l.text)).map(l => l.text).slice(0, 10),
    mainLinks: mainLinks.slice(0, 200),
    pdfLinkCount: mainLinks.filter(l => /\\.pdf(\\?|#|$)/i.test(l.href)).length,
    horizontalOverflowAt375: false,
  }
})()`

// Same check at phone width, run after resizing the viewport to 375px.
export const OVERFLOW_SCRIPT = `(() => document.documentElement.scrollWidth > window.innerWidth + 2)()`

// ── Readability ──────────────────────────────────────────────────────────
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

/** Flesch-Kincaid grade level of a block of text, or null when too short to judge. */
export function readingGrade(text: string): number | null {
  const sentences = text.split(/[.!?]+(?:\s|$)/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3)
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w))
  if (words.length < 60 || sentences.length < 3) return null
  const syl = words.reduce((n, w) => n + syllables(w), 0)
  return Math.round((0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59) * 10) / 10
}

// ── School year helper ───────────────────────────────────────────────────
/** The current BCPS school year, which starts July 1 (e.g. "2026-27"). */
export function currentSchoolYear(now: Date = new Date()): { start: number; end: number } {
  const y = now.getFullYear()
  const start = now.getMonth() >= 6 ? y : y - 1
  return { start, end: start + 1 }
}

// ── The marketing checks ─────────────────────────────────────────────────
export interface CheckContext {
  facts: PageFacts
  deptName: string
  brokenLinks: { href: string; status: number }[]
  linksChecked: number
  now: Date
}

export interface CheckResult { passed: boolean; detail: string }

export interface MarketingCheck {
  id: string
  title: string
  weight: number
  why: string
  steps: string[]
  run: (c: CheckContext) => CheckResult
}

const nameTokens = (name: string) => name.toLowerCase().replace(/&/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !['and', 'the', 'for', 'office', 'department', 'services', 'of'].includes(t))
const mentionsName = (text: string, name: string) => {
  const toks = nameTokens(name)
  if (!toks.length) return true
  const t = text.toLowerCase()
  return toks.filter((k) => t.includes(k)).length >= Math.ceil(toks.length / 2)
}

const PAGE_SETTINGS_STEPS = [
  'In Composer, open the page and choose Page Settings (the gear at the top of the page).',
]

export const MARKETING_CHECKS: MarketingCheck[] = [
  {
    id: 'title-names-department',
    title: 'The page title names your department',
    weight: 8,
    why: 'The page title is what shows in the browser tab, in bookmarks and as the blue link in Google results. If it does not say who you are, people scroll past it.',
    steps: [...PAGE_SETTINGS_STEPS, 'Check the Page Title, and the SEO Title if one is set, both use your department’s current name.', 'Leave the SEO Title on its default when you can, so it follows the page title when your name changes.'],
    run: ({ facts, deptName }) => mentionsName(facts.title, deptName)
      ? { passed: true, detail: `Title: "${facts.title}"` }
      : { passed: false, detail: `The title "${facts.title || '(none)'}" does not include "${deptName}".` },
  },
  {
    id: 'meta-description',
    title: 'The page has a search description (50 to 160 characters)',
    weight: 6,
    why: 'Google shows this sentence under your link. A clear one tells families and staff they found the right office before they click.',
    steps: [...PAGE_SETTINGS_STEPS, 'Fill in the Meta Description (SEO description) with one sentence on what your department does and who it serves.', 'Keep it between 50 and 160 characters.'],
    run: ({ facts }) => {
      const n = facts.metaDescription.length
      if (n >= 50 && n <= 160) return { passed: true, detail: `${n} characters.` }
      return { passed: false, detail: n === 0 ? 'No search description is set.' : `The description is ${n} characters; aim for 50 to 160.` }
    },
  },
  {
    id: 'purpose-statement',
    title: 'A short intro says what your department does',
    weight: 10,
    why: 'Visitors decide in seconds whether they are in the right place. One plain paragraph at the top (who you are, who you serve, how you help) answers that.',
    steps: ['Add a Content element at the top of the page, under the page heading.', 'Write two to four sentences: what your department does, who it serves, and the most common reason people contact you.', 'Keep the whole intro to one or two short paragraphs.'],
    run: ({ facts }) => facts.firstParagraphWords >= 25
      ? { passed: true, detail: `Opening paragraph has ${facts.firstParagraphWords} words.` }
      : { passed: false, detail: facts.firstParagraphWords ? `The opening paragraph is only ${facts.firstParagraphWords} words.` : 'No intro paragraph was found near the top of the page.' },
  },
  {
    id: 'contact-phone',
    title: 'A phone number is on the page',
    weight: 10,
    why: 'Calling is still the first thing many families and staff try. A number in the footer of the whole site does not count; it needs to be yours, on your page.',
    steps: ['Add a Contact Us section (a Content element or the side column) with your main office number.', 'Link it so it dials on a phone: select the number, insert a link, and use tel: followed by the number (for example tel:7543212000).'],
    run: ({ facts }) => facts.hasPhone ? { passed: true, detail: 'A phone number was found.' } : { passed: false, detail: 'No phone number was found in the page content.' },
  },
  {
    id: 'contact-email',
    title: 'An email address is on the page',
    weight: 8,
    why: 'Email lets people reach you after hours and gives you a written record. Use a shared department address where you have one, so it survives staff changes.',
    steps: ['In your Contact Us section, add your department email address.', 'Select it and insert a link using mailto: followed by the address.'],
    run: ({ facts }) => facts.hasEmail ? { passed: true, detail: 'An email address was found.' } : { passed: false, detail: 'No email address was found in the page content.' },
  },
  {
    id: 'section-headings',
    title: 'The page is broken into sections with headings',
    weight: 8,
    why: 'People scan web pages instead of reading them. Headings let them jump to the part they need, and screen reader users navigate by them.',
    steps: ['Group your content into short sections, for example Services, Forms and Resources, Contact Us.', 'Give each section a heading using the Heading 2 style in the Composer text editor (not bold text).', 'Use Heading 3 for a section inside a section.'],
    run: ({ facts }) => facts.sectionHeadings >= 2
      ? { passed: true, detail: `${facts.sectionHeadings} section headings found.` }
      : { passed: false, detail: `${facts.sectionHeadings} section heading${facts.sectionHeadings === 1 ? '' : 's'} found; aim for at least 2.` },
  },
  {
    id: 'plain-language',
    title: 'Writing is plain (about grade 10 or below)',
    weight: 10,
    why: 'Plain-language guidance for public websites aims for a 6th to 8th grade reading level. Shorter sentences and everyday words help every reader, including parents reading in a second language.',
    steps: ['Shorten long sentences: one idea per sentence, about 20 words or fewer.', 'Swap formal words for everyday ones (use "help" instead of "facilitate", "use" instead of "utilize").', 'Turn long lists inside sentences into bulleted lists.', 'Spell out acronyms the first time you use them.'],
    run: ({ facts }) => {
      const g = readingGrade(facts.mainText)
      if (g === null) return { passed: true, detail: 'Not enough text to measure; counted as passing.' }
      const shown = g > 20 ? '20+' : String(g)
      return g <= 10 ? { passed: true, detail: `Reading level about grade ${shown}.` } : { passed: false, detail: `Reading level about grade ${shown}; aim for 10 or below.` }
    },
  },
  {
    id: 'descriptive-links',
    title: 'Links say where they go (no "click here")',
    weight: 8,
    why: 'Link text like "click here" or "read more" means nothing when scanned or read aloud by a screen reader. Descriptive links also help search engines.',
    steps: ['Find links that say click here, here, read more or learn more.', 'Rewrite the link text to name the destination, for example "Download the Leave Request Form (PDF)".'],
    run: ({ facts }) => facts.vagueLinks.length === 0
      ? { passed: true, detail: 'Every link describes its destination.' }
      : { passed: false, detail: `${facts.vagueLinks.length} vague link${facts.vagueLinks.length === 1 ? '' : 's'}: ${facts.vagueLinks.slice(0, 4).map((t) => `"${t}"`).join(', ')}.` },
  },
  {
    id: 'no-broken-links',
    title: 'No broken links',
    weight: 12,
    why: 'A broken link is a dead end for the visitor and a signal to search engines that the page is not maintained.',
    steps: ['Open each link listed in your audit.', 'Relink it to the right page using the internal link option (Site Page or Site File), never a pasted address, so it keeps working when pages move.', 'Remove the link if the destination no longer exists.'],
    run: ({ brokenLinks, linksChecked }) => brokenLinks.length === 0
      ? { passed: true, detail: `${linksChecked} link${linksChecked === 1 ? '' : 's'} checked, none broken.` }
      : { passed: false, detail: `${brokenLinks.length} broken: ${brokenLinks.slice(0, 3).map((b) => `${b.href} (${b.status || 'no response'})`).join('; ')}.` },
  },
  {
    id: 'current-content',
    title: 'Content is current for this school year',
    weight: 8,
    why: 'Old dates tell visitors the page is not maintained, and they stop trusting everything else on it.',
    steps: ['Search your page for past school years (for example 2024-25 or 2024-2025).', 'Update or remove anything that is out of date.', 'Move older material you must keep into an Archive section, labeled by school year.'],
    run: ({ facts, now }) => {
      const { start } = currentSchoolYear(now)
      const re = /\b(20\d{2})\s*[-–\/]\s*(20)?(\d{2})\b/g
      const past: string[] = []
      let current = false
      let m: RegExpExecArray | null
      while ((m = re.exec(facts.mainText))) {
        const s = Number(m[1])
        if (s >= start) current = true
        else if (s >= 2015) past.push(m[0])
      }
      const archived = /archive/i.test(facts.mainText)
      if (!past.length || current || archived) return { passed: true, detail: past.length ? 'Older school years appear alongside current or archived content.' : 'No outdated school years found.' }
      return { passed: false, detail: `Mentions past school years (${Array.from(new Set(past)).slice(0, 3).join(', ')}) and nothing current.` }
    },
  },
  {
    id: 'not-pdf-only',
    title: 'Key information is on the page, not only in PDFs',
    weight: 6,
    why: 'PDFs are slow on phones, hard to keep accessible, and invisible to most site searches. Put the essentials on the page and link PDFs as supporting documents.',
    steps: ['If most of your links are PDFs, move the key facts (what, who, when, how to apply) onto the page as text.', 'Keep PDFs for forms people must print or sign, and label them "(PDF)" in the link text.'],
    run: ({ facts }) => {
      const total = facts.mainLinks.length
      if (total < 4) return { passed: true, detail: 'Too few links to judge; counted as passing.' }
      const share = facts.pdfLinkCount / total
      return share <= 0.5 ? { passed: true, detail: `${facts.pdfLinkCount} of ${total} links are PDFs.` } : { passed: false, detail: `${facts.pdfLinkCount} of ${total} links are PDFs.` }
    },
  },
  {
    id: 'mobile-fit',
    title: 'The page fits a phone screen',
    weight: 6,
    why: 'Most visitors arrive on a phone. Content wider than the screen (wide tables, fixed-size images, embeds) forces sideways scrolling.',
    steps: ['Open the page on your phone, or use Preview in Composer at phone width.', 'Replace wide tables with a list or accordion, or split them up.', 'Remove fixed widths from images and embeds so they shrink to fit.'],
    run: ({ facts }) => facts.horizontalOverflowAt375
      ? { passed: false, detail: 'Content is wider than a 375 pixel phone screen.' }
      : { passed: true, detail: 'No sideways scrolling at phone width.' },
  },
]

export const MARKETING_TOTAL = MARKETING_CHECKS.reduce((n, c) => n + c.weight, 0) // 100

// ── Accessibility scoring (WCM-owned rules only) ─────────────────────────
export interface AxeLike { id: string; impact: string | null; description: string; help?: string; helpUrl?: string; nodeCount?: number }
const IMPACT_PENALTY: Record<string, number> = { critical: 15, serious: 10, moderate: 5, minor: 2 }

export function ownerOf(axeId: string): { entry: GlossaryEntry | null; owner: 'wcm' | 'finalsite' | 'depends' } {
  const entry = lookupAxeEntry(axeId)
  return { entry, owner: entry ? entry.owner : 'depends' }
}

/** Accessibility score out of 100, counting only rules a WCM can fix. */
export function accessibilityScore(violations: AxeLike[]): { score: number; counted: AxeLike[]; finalsite: AxeLike[] } {
  const counted: AxeLike[] = []
  const finalsite: AxeLike[] = []
  for (const v of violations) (ownerOf(v.id).owner === 'finalsite' ? finalsite : counted).push(v)
  const penalty = counted.reduce((n, v) => n + (IMPACT_PENALTY[v.impact ?? 'moderate'] ?? 5), 0)
  return { score: Math.max(0, 100 - penalty), counted, finalsite }
}

// ── Running the marketing half ───────────────────────────────────────────
export interface MarketingResult { id: string; title: string; weight: number; passed: boolean; detail: string; steps: string[] }

export function runMarketingChecks(ctx: CheckContext): { score: number; results: MarketingResult[] } {
  const results = MARKETING_CHECKS.map((c) => {
    let r: CheckResult
    try { r = c.run(ctx) } catch { r = { passed: true, detail: 'Could not be measured on this page; counted as passing.' } }
    return { id: c.id, title: c.title, weight: c.weight, passed: r.passed, detail: r.detail, steps: c.steps }
  })
  const earned = results.reduce((n, r) => n + (r.passed ? r.weight : 0), 0)
  return { score: Math.round((earned / MARKETING_TOTAL) * 100), results }
}

/** Same-site links worth checking for 404s (http/https, not mail/tel/anchors). */
export function linksToCheck(facts: PageFacts, max = 30): string[] {
  const seen = new Set<string>()
  for (const l of facts.mainLinks) {
    if (!/^https?:/i.test(l.href)) continue
    const u = l.href.split('#')[0]
    if (u && !seen.has(u)) seen.add(u)
    if (seen.size >= max) break
  }
  return Array.from(seen)
}

/** Check links server-side: HEAD first, GET if HEAD is refused. Returns only the broken ones. */
export async function findBrokenLinks(urls: string[]): Promise<{ href: string; status: number }[]> {
  const check = async (href: string) => {
    const attempt = async (method: string) => {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 8000)
      try {
        const r = await fetch(href, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'BCPS-MarComm-Audit/2' } })
        return r.status
      } catch { return 0 } finally { clearTimeout(t) }
    }
    let s = await attempt('HEAD')
    if (s === 405 || s === 403 || s === 0) s = await attempt('GET')
    return { href, status: s }
  }
  const out: { href: string; status: number }[] = []
  for (let i = 0; i < urls.length; i += 6) {
    const batch = await Promise.all(urls.slice(i, i + 6).map(check))
    out.push(...batch)
  }
  // Only clear failures count: 404 or 410. Timeouts can be our network, and
  // sites that block bots (401/403/429) are not the WCM's broken link.
  return out.filter((r) => r.status === 404 || r.status === 410)
}
