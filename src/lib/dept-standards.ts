// lib/dept-standards.ts
//
// Department audit v3 (Sean, 2026-10-06): the audit grades a department page
// against the WCM Department Certification course, nothing else. Every check
// below quotes the course's own standard and links to the course page that
// teaches it, so an audit note and the training never disagree.
//
// Each check comes back green (pass), red (fail) or amber (review: a person
// has to look). Only green and red count toward the score. Every red or amber
// item carries the exact elements it is about, so the audit viewer can pin
// them on a screenshot of the WCM's own page.
//
// Finalsite markup this relies on (confirmed against 58 live department
// pages, 2026-10-06): main#fsPageContent, h1.fsPageTitle, .fsPageLayout with
// fsOneColumnLayout, element layouts fsTwoColumn*/fsThreeColumn*, .fsElement
// .fsContent / .fsResourceElement / .fsConstituent (directory) /
// .fsPanelGroup (tabs, accordions), the left menu in #fsBannerLeft
// .fsNavigation, button classes small-button / large-button /
// full-width-button / button-*-bg / external-link-button, and contact blocks
// that often sit in the directory element's own <footer>.

import type { Page } from 'puppeteer-core'
import { lookupAxeEntry } from './ada-glossary'

export const AUDIT_VERSION = 3

export type CheckStatus = 'pass' | 'fail' | 'review'
export type CheckArea = 'Homepage' | 'Layout' | 'Content' | 'Navigation' | 'Accessibility'

export interface CourseRef { moduleId: string; pageId: string; label: string }
export const courseHref = (c: CourseRef) => `/certification/departments/course/${c.moduleId}/${c.pageId}`

export interface Rect { x: number; y: number; w: number; h: number }
export interface CheckTarget { label: string; ref?: string; selector?: string; desktop?: Rect | null; mobile?: Rect | null }

export interface CheckResult {
  id: string
  area: CheckArea
  title: string
  status: CheckStatus
  /** What we found on this page, in one or two sentences. */
  detail: string
  /** Specific items (link texts, image names) when there is a list. */
  items?: string[]
  targets: CheckTarget[]
  why: string
  steps: string[]
  course: CourseRef
}

// ── What the page tells us ───────────────────────────────────────────────
export interface StdFacts {
  url: string
  title: string
  pageLayoutClass: string
  multiColumn: { ref: string; kind: string }[]
  first: { ref: string; kind: string; isContent: boolean; text: string } | null
  contentImages: { ref: string; name: string }[]
  buttons: { ref: string; text: string }[]
  directory: { ref: string } | null
  contact: { ref: string; hasTel: boolean; telHref: string; hasMaps: boolean; hasBold: boolean; boldText: string; nearBottom: boolean } | null
  leftNav: { ref: string; links: number; genericLabels: { ref: string; text: string }[] } | null
  links: { ref: string; href: string; raw: string; text: string }[]
  longBlocks: { ref: string; words: number }[]
  /** Headings in the content that skip a level or are empty (course: "Do not skip heading levels"). */
  headingSkips: { ref: string; text: string; from: number; to: number }[]
  images: { ref: string; name: string }[]
  mainText: string
  overflowAt375?: boolean
}

/** Runs inside the page. Tags every element it reports with data-audit-ref so pins can find it later. */
export const COLLECT_STANDARDS_SCRIPT = `(() => {
  let n = 0
  const ref = (el) => { if (!el.dataset.auditRef) el.dataset.auditRef = String(++n); return el.dataset.auditRef }
  const txt = (el) => (el ? (el.innerText || el.textContent || '') : '').replace(/\\s+/g, ' ').trim()
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  const main = document.querySelector('#fsPageContent') || document.querySelector('main') || document.body
  const titleEl = main.querySelector('.fsPageTitle') || main.querySelector('h1')
  const layout = main.querySelector('.fsPageLayout')

  const kindOf = (el) => {
    const c = el.classList
    if (c.contains('fsContent')) return txt(el) ? 'a Content element' : (el.querySelector('img') ? 'an image inside a Content element' : 'an empty Content element')
    if (c.contains('fsResourceElement')) return 'an image or file element'
    if (c.contains('fsPanelGroup')) return c.contains('fsTabs') ? 'a tabs element' : 'an accordion'
    if (c.contains('fsConstituent')) return 'the staff directory'
    if (c.contains('fsPost')) return 'a post board'
    if (c.contains('fsEmbed')) return 'an embed'
    if (c.contains('fsContainer')) return 'a container'
    if (c.contains('fsLayout')) return 'a layout'
    return 'a ' + ([].find.call(c, (k) => /^fs[A-Z]/.test(k) && k !== 'fsElement') || 'page element')
  }

  const multiColumn = Array.from(main.querySelectorAll('[class*="TwoColumn"], [class*="ThreeColumn"], [class*="FourColumn"]'))
    .filter((el) => /fs(Two|Three|Four)Column/.test(el.className) && !el.closest('.fsConstituent'))
    .map((el) => ({ ref: ref(el), kind: (el.className.match(/fs(Two|Three|Four)Column\\w*/) || [''])[0] }))

  const els = Array.from(main.querySelectorAll('.fsElement')).filter((el) =>
    visible(el) && !el.classList.contains('fsLayout') && !el.classList.contains('fsBreadcrumb') && !el.classList.contains('fsPanel'))
  const f = els[0]
  const first = f ? { ref: ref(f), kind: kindOf(f), isContent: f.classList.contains('fsContent') && txt(f).length > 0, text: txt(f).slice(0, 2000) } : null

  const dec = (v) => { try { return decodeURIComponent(v) } catch (e) { return v } }
  const imgName = (img) => dec(img.getAttribute('alt') || img.dataset.resourceTitle || (img.closest('[data-resource-title]') || {}).dataset?.resourceTitle || (img.currentSrc || img.src || '').split('/').pop() || 'image').slice(0, 80)
  const bigImg = (img) => (img.naturalWidth || img.width || 0) >= 80 && (img.naturalHeight || img.height || 0) >= 40
  const contentImages = Array.from(main.querySelectorAll('.fsContent img')).filter((i) => visible(i) && bigImg(i)).slice(0, 10).map((i) => ({ ref: ref(i), name: imgName(i) }))
  const images = Array.from(main.querySelectorAll('img')).filter((i) => visible(i) && bigImg(i) && !i.closest('.fsConstituent')).slice(0, 12).map((i) => ({ ref: ref(i), name: imgName(i) }))

  const BTN = /(^|\\s)(small-button|large-button|full-width-button|external-link-button|button-[a-z0-9-]+)(\\s|$)/
  const buttons = Array.from(main.querySelectorAll('a[class]')).filter((a) => BTN.test(a.className) && visible(a)).map((a) => ({ ref: ref(a), text: txt(a).slice(0, 60) }))

  const dirEl = main.querySelector('.fsConstituent')
  const directory = dirEl ? { ref: ref(dirEl) } : null

  // Contact block: the container around a tel: link (or a maps link) with the
  // most of the required parts.
  const mainTop = main.getBoundingClientRect().top + scrollY
  const mainH = Math.max(1, main.getBoundingClientRect().height)
  const MAPS = 'a[href*="maps.app.goo.gl"], a[href*="goo.gl/maps"], a[href*="google.com/maps"], a[href*="maps.google"]'
  const seeds = Array.from(main.querySelectorAll('a[href^="tel:"], ' + MAPS))
  let contact = null
  for (const a of seeds) {
    const box = a.closest('.fsElementFooterContent, .fsElementContent, .fsElement') || a.parentElement
    const tel = box.querySelector('a[href^="tel:"]')
    const bold = box.querySelector('strong, b')
    const r = box.getBoundingClientRect()
    const c = { ref: ref(box), hasTel: !!tel, telHref: tel ? tel.getAttribute('href') : '', hasMaps: !!box.querySelector(MAPS), hasBold: !!bold, boldText: bold ? txt(bold).slice(0, 80) : '', nearBottom: (r.top + scrollY - mainTop) / mainH >= 0.5 }
    const score = (x) => (x.hasTel ? 1 : 0) + (x.hasMaps ? 1 : 0) + (x.hasBold ? 1 : 0) + (x.nearBottom ? 0.5 : 0)
    if (!contact || score(c) > score(contact)) contact = c
  }

  // Only the left banner counts; the site header has its own (template) menus.
  const navEl = document.querySelector('#fsBannerLeft .fsNavigation')
  let leftNav = null
  if (navEl && visible(navEl)) {
    const top = Array.from(navEl.querySelectorAll('.fsNavLevel1 > li > a'))
    leftNav = { ref: ref(navEl), links: navEl.querySelectorAll('a').length,
      genericLabels: top.filter((a) => /^(overview|home|home page)$/i.test(txt(a))).map((a) => ({ ref: ref(a), text: txt(a) })) }
  }

  const links = Array.from(main.querySelectorAll('a[href]')).filter((a) => {
    const h = a.getAttribute('href') || ''
    return h && !/^(#|mailto:|tel:|javascript:)/i.test(h) && !a.closest('.fsElementPagination, .fsTabsNav') && !a.classList.contains('fsConstituentProfileLink') && visible(a)
  }).slice(0, 150).map((a) => ({ ref: ref(a), href: a.href, raw: a.getAttribute('href') || '', text: (txt(a) || a.getAttribute('aria-label') || a.getAttribute('title') || '').slice(0, 120) }))

  // Our own heading-order check, in reading order from the page title. axe's
  // heading-order rule proved inconsistent between runs on the same page
  // (Labor Relations, Oct 6-7), and the course rule is simple: no skips.
  const headingSkips = []
  let prevLevel = 0
  for (const h of Array.from(main.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    if (!visible(h) || h.closest('[aria-hidden="true"]')) continue
    const level = Number(h.tagName[1])
    // textContent, not innerText: the site's CSS uppercases headings.
    const text = (h.textContent || '').replace(/\\s+/g, ' ').trim()
    if (!text) headingSkips.push({ ref: ref(h), text: '', from: prevLevel, to: level })
    else if (prevLevel && level > prevLevel + 1) headingSkips.push({ ref: ref(h), text: text.slice(0, 80), from: prevLevel, to: level })
    prevLevel = level
  }

  const longBlocks = Array.from(main.querySelectorAll('.fsContent p, .fsContent > .fsElementContent > div')).map((p) => ({ p, words: txt(p).split(' ').filter(Boolean).length }))
    .filter((x) => x.words >= 150 && visible(x.p)).slice(0, 8).map((x) => ({ ref: ref(x.p), words: x.words }))

  return {
    url: location.href, title: txt(titleEl), pageLayoutClass: layout ? layout.className : '',
    multiColumn, first, contentImages, buttons, directory, contact, leftNav, links, longBlocks, images, headingSkips,
    mainText: txt(main).slice(0, 60000),
  }
})()`

// ── Helpers ──────────────────────────────────────────────────────────────
/** The current BCPS school year, which starts July 1 (e.g. 2026 for 2026-27). */
export function currentSchoolYearStart(now: Date = new Date()): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
}

const VAGUE = /^(click here|click|here|read more|learn more|more|more info|more information|this link|link|go|details|info|download|view)$/i
const SITE_HOST = /^https?:\/\/(www\.)?browardschools\.com(\/|$)/i
const t = (ref: string | undefined, label: string): CheckTarget => ({ ref, label })

export interface StdContext {
  facts: StdFacts
  deptName: string
  brokenLinks: { href: string; status: number }[]
  linksChecked: number
  now: Date
}

interface StdCheck {
  id: string
  area: CheckArea
  title: string
  why: string
  steps: string[]
  course: CourseRef
  run: (ctx: StdContext) => Pick<CheckResult, 'status' | 'detail' | 'items' | 'targets'>
}

const C = {
  homepage: { moduleId: 'mod2', pageId: 'homepage', label: 'Module 2: Required Content: Homepage' },
  layoutChecklist: { moduleId: 'mod3', pageId: 'checklist', label: 'Module 3: Layout Quick Checklist' },
  layoutStandards: { moduleId: 'mod3', pageId: 'standards', label: 'Module 3: Layout Standards' },
  writing: { moduleId: 'mod4', pageId: 'writing', label: 'Module 4: Writing and Updating Content' },
  condensing: { moduleId: 'mod4', pageId: 'proofreading', label: 'Module 4: Condensing and Organizing Content' },
  commonIssues: { moduleId: 'mod4', pageId: 'common-issues', label: 'Module 4: Common Content Issues' },
  navStandards: { moduleId: 'mod5', pageId: 'standards', label: 'Module 5: Navigation Standards' },
  navChecking: { moduleId: 'mod5', pageId: 'dropdowns', label: 'Module 5: Checking and Correcting Navigation' },
  pdfs: { moduleId: 'mod9', pageId: 'checker', label: 'Module 9: Finalsite Accessibility Checker' },
  accessiblePage: { moduleId: 'mod9', pageId: 'accessible-page', label: 'Module 9: What Makes a Page Accessible?' },
  adaIntro: { moduleId: 'mod9', pageId: 'intro', label: 'Module 9: Introduction to ADA and Web Accessibility' },
  altText: { moduleId: 'mod12', pageId: 'alt-text', label: 'Module 12: Adding Alt Text' },
  linkLanguage: { moduleId: 'mod12', pageId: 'link-language', label: 'Module 12: Link Language' },
} satisfies Record<string, CourseRef>

// ── The standards, in course order ───────────────────────────────────────
export const STANDARD_CHECKS: StdCheck[] = [
  {
    id: 'description-first', area: 'Homepage', course: C.homepage,
    title: 'The department description comes first',
    why: 'Department pages do not use a hero image. Content begins immediately at the top of the page, and the description is your opening statement to every visitor.',
    steps: ['Open the page in Composer.', 'Drag the Content element with your description to the top of the page, directly under the page title.', 'Move any photo, banner or other element below the description.'],
    run: ({ facts }) => {
      const f = facts.first
      if (!f) return { status: 'fail', detail: 'No page content was found under the page title.', targets: [] }
      if (f.isContent) return { status: 'pass', detail: 'A Content element with your description is the first thing under the page title.', targets: [] }
      return { status: 'fail', detail: `The first thing under the page title is ${f.kind}, not your description.`, targets: [t(f.ref, 'Above your description')] }
    },
  },
  {
    id: 'description-length', area: 'Homepage', course: C.homepage,
    title: 'The description is 250 characters or fewer',
    why: 'A concise description is the first element visitors see. Keep it brief and direct; the rest of the page carries the detail.',
    steps: ['Copy your description into Copilot and ask it to shorten it to 250 characters or fewer.', 'Paste the shorter version back into the first Content element.', 'Move the longer text further down the page, or into an accordion.'],
    run: ({ facts }) => {
      const f = facts.first
      if (!f || !f.isContent) return { status: 'fail', detail: 'There is no description at the top of the page to measure (see the check above).', targets: [] }
      const n = f.text.length
      return n <= 250
        ? { status: 'pass', detail: `Your description is ${n} characters.`, targets: [] }
        : { status: 'fail', detail: `Your description is ${n} characters, ${n - 250} over the limit.`, targets: [t(f.ref, `${n} characters`)] }
    },
  },
  {
    id: 'photo-element', area: 'Homepage', course: C.homepage,
    title: 'Photos use the rounded photo element, not a Content element',
    why: 'Photos use the WCM Enhancements rounded-corner photo element. Images inserted directly into a content element do not follow the district style and are hard to manage.',
    steps: ['Delete the image from inside the Content element.', 'Add a Resource (photo) element in its place and choose the image from your gallery.', 'Apply the rounded photo style from WCM Enhancements, and give the photo alt text.'],
    run: ({ facts }) => facts.contentImages.length === 0
      ? { status: 'pass', detail: 'No images are placed inside Content elements.', targets: [] }
      : { status: 'fail', detail: `${facts.contentImages.length} image${facts.contentImages.length === 1 ? ' is' : 's are'} inserted inside a Content element.`, items: facts.contentImages.map((i) => i.name), targets: facts.contentImages.map((i) => t(i.ref, i.name)) },
  },
  {
    id: 'quick-access', area: 'Homepage', course: C.homepage,
    title: 'Three to six Quick Access buttons',
    why: 'Quick Access buttons take visitors straight to your most visited pages. Limit them to your real top priorities; do not list every page.',
    steps: ['Pick your three to six most visited pages (your Analytics tab shows them).', 'For each one, add a link in a Content element under your description.', 'Right-click the link, choose Edit Link, and apply a button size class and a color class (for example small button and button blue).'],
    run: ({ facts }) => {
      const n = facts.buttons.length
      if (n >= 3 && n <= 6) return { status: 'pass', detail: `${n} Quick Access buttons.`, items: facts.buttons.map((b) => b.text), targets: [] }
      if (n === 0) return { status: 'fail', detail: 'No Quick Access buttons were found.', targets: [] }
      return { status: 'fail', detail: n < 3 ? `Only ${n} button${n === 1 ? '' : 's'}; add ${3 - n} more.` : `${n} buttons; trim to your top six.`, items: facts.buttons.map((b) => b.text), targets: facts.buttons.map((b) => t(b.ref, b.text || 'Button')) }
    },
  },
  {
    id: 'staff-directory', area: 'Homepage', course: C.homepage,
    title: 'A Constituent Directory shows your key contacts',
    why: 'The staff listing tells visitors who to contact. It is set up through WCM Enhancements, so names and titles stay current from one source.',
    steps: ['Submit an IIQ request, or bring it to a Hot Lab, to have the Constituent Directory set up for your department.', 'Place it near the bottom of the homepage, above your contact information.'],
    run: ({ facts }) => facts.directory
      ? { status: 'pass', detail: 'A staff directory is on the page.', targets: [] }
      : { status: 'fail', detail: 'No Constituent Directory was found on this page.', targets: [] },
  },
  {
    id: 'contact-info', area: 'Homepage', course: C.homepage,
    title: 'Contact information at the bottom, in the required format',
    why: 'Visitors look for contact details at the bottom of the page. The required format (bold name, mapped address, tappable phone) works the same way on every department page.',
    steps: ['At the bottom of the homepage, add (or edit) a Content element with: your department name in bold; your address, linked to your Google Maps location; and your phone number.', 'Link the phone number with tel: and no spaces, for example tel:7545551234.', 'Fax is optional: use the "F:" prefix in the same format.'],
    run: ({ facts }) => {
      const c = facts.contact
      if (!c) return { status: 'fail', detail: 'No contact block with a phone link or a map link was found.', targets: [] }
      const missing: string[] = []
      if (!c.hasBold) missing.push('the department name in bold')
      if (!c.hasMaps) missing.push('an address linked to Google Maps')
      if (!c.hasTel) missing.push('a clickable phone number (tel: link)')
      else if (/\s|%20/.test(c.telHref)) missing.push('a phone link with no spaces')
      if (!c.nearBottom) missing.push('placement at the bottom of the page')
      return missing.length === 0
        ? { status: 'pass', detail: 'Bold name, mapped address and clickable phone, at the bottom of the page.', targets: [] }
        : { status: 'fail', detail: `Your contact block is missing ${missing.join(', ')}.`, targets: [t(c.ref, 'Contact block')] }
    },
  },
  {
    id: 'single-column', area: 'Layout', course: C.layoutStandards,
    title: 'Single-column layout, with no side-by-side columns',
    why: 'All department landing and overview pages must use a single-column layout. Multi-column layouts break on phones, are harder to scan, and do not match the district standard.',
    steps: ['In Compose Mode, click the building block icon, then "Edit page layout, banners and themes", and confirm the page is single column.', 'For any two- or three-column layout element, drag its content out into the single column.', 'Use accordion or tab elements (Add Element, Layout tab) to organize what was in the side column.'],
    run: ({ facts }) => {
      const pageOne = /fsOneColumnLayout/.test(facts.pageLayoutClass) || !facts.pageLayoutClass
      if (pageOne && facts.multiColumn.length === 0) return { status: 'pass', detail: 'The page and everything on it is single column.', targets: [] }
      const d = !pageOne ? 'The page itself uses a multi-column layout.' : `${facts.multiColumn.length} section${facts.multiColumn.length === 1 ? ' places' : 's place'} content side by side in columns.`
      return { status: 'fail', detail: d, targets: facts.multiColumn.map((m) => t(m.ref, 'Side-by-side columns')) }
    },
  },
  {
    id: 'dense-content', area: 'Layout', course: C.condensing,
    title: 'No long unbroken blocks of text',
    why: 'Pages with very long, unbroken blocks of content are flagged. Content that belongs together but does not all need to be visible should go in lists, accordions or tabs.',
    steps: ['Turn any paragraph that lists three or more items into a bulleted list.', 'Move detail not every visitor needs into an accordion (Add Element, Layout tab, Accordion).', 'Use tabs when the content splits by audience or program.'],
    run: ({ facts }) => facts.longBlocks.length === 0
      ? { status: 'pass', detail: 'No paragraph runs 150 words or more.', targets: [] }
      : { status: 'review', detail: `${facts.longBlocks.length} paragraph${facts.longBlocks.length === 1 ? ' runs' : 's run'} 150 words or more. Check whether ${facts.longBlocks.length === 1 ? 'it' : 'each'} should become a list, an accordion or tabs.`, targets: facts.longBlocks.map((b) => t(b.ref, `${b.words} words`)) },
  },
  {
    id: 'mobile-fit', area: 'Layout', course: C.layoutChecklist,
    title: 'The page displays correctly on a phone',
    why: 'All pages must display correctly on a mobile screen. Content wider than the screen forces visitors to scroll sideways.',
    steps: ['Open the page on your phone, or switch this viewer to Phone.', 'Replace wide tables with a list, an accordion or smaller tables.', 'Remove fixed widths from images and embeds so they shrink to fit.'],
    run: ({ facts }) => facts.overflowAt375 === undefined
      ? { status: 'review', detail: 'The phone check could not run; switch the viewer to Phone and look.', targets: [] }
      : facts.overflowAt375
        ? { status: 'fail', detail: 'Something on the page is wider than a phone screen, so visitors have to scroll sideways.', targets: [] }
        : { status: 'pass', detail: 'Fits a phone screen with no sideways scrolling.', targets: [] },
  },
  {
    id: 'current-content', area: 'Content', course: C.writing,
    title: 'All dates and information are current',
    why: 'Dates from past school years and expired deadlines are among the most common audit findings, and they undermine trust in everything else on the page.',
    steps: ['Search the page for past school years (for example 2024-25 or 2024-2025).', 'Update or remove anything out of date.', 'If older material must stay, move it into an Archive section labeled by school year.'],
    run: ({ facts, now }) => {
      const start = currentSchoolYearStart(now)
      const re = /\b(20\d{2})\s*[-–/]\s*(20)?(\d{2})\b/g
      const past = new Set<string>()
      let m: RegExpExecArray | null
      while ((m = re.exec(facts.mainText))) { const s = Number(m[1]); if (s < start && s >= 2015) past.add(m[0]) }
      if (past.size === 0) return { status: 'pass', detail: 'No past school years were found on the page.', targets: [] }
      if (/archive/i.test(facts.mainText)) return { status: 'review', detail: `Past school years appear (${Array.from(past).slice(0, 4).join(', ')}). Confirm each one is in an Archive section.`, items: Array.from(past), targets: [] }
      return { status: 'fail', detail: `The page mentions past school years: ${Array.from(past).slice(0, 4).join(', ')}.`, items: Array.from(past), targets: [] }
    },
  },
  {
    id: 'descriptive-links', area: 'Content', course: C.linkLanguage,
    title: 'Every link describes where it goes',
    why: 'Link text like "click here" or "read more" tells visitors nothing, and screen readers read links out of context. This is both a content standard and an ADA requirement.',
    steps: ['Select the link text and type a description of the destination.', 'For example: "View the 2026-27 Professional Development Calendar (PDF)" instead of "click here".'],
    run: ({ facts }) => {
      const bad = facts.links.filter((l) => VAGUE.test(l.text.replace(/[.:!»>›]+$/, '').trim()) || (/^https?:\/\//i.test(l.text)))
      return bad.length === 0
        ? { status: 'pass', detail: facts.links.length === 1 ? 'The one link on the page describes its destination.' : `All ${facts.links.length} links describe their destination.`, targets: [] }
        : { status: 'fail', detail: `${bad.length} link${bad.length === 1 ? ' does' : 's do'} not say where ${bad.length === 1 ? 'it goes' : 'they go'}.`, items: bad.map((l) => `"${l.text}"`), targets: bad.map((l) => t(l.ref, `"${l.text}"`)) }
    },
  },
  {
    id: 'text-images', area: 'Content', course: C.commonIssues,
    title: 'No text-heavy images or flyers',
    why: 'Screen readers cannot read text inside an image. If an image carries important information, that information must also be on the page as text.',
    steps: ['Look at each image pinned on your page.', 'If it is a flyer or graphic full of text, type that information onto the page, or add it as text right below the image.'],
    run: ({ facts }) => facts.images.length === 0
      ? { status: 'pass', detail: 'There are no images in your page content.', targets: [] }
      : { status: 'review', detail: `Look at ${facts.images.length === 1 ? 'the image' : `these ${facts.images.length} images`} and confirm none is a flyer or text graphic.`, items: facts.images.map((i) => i.name), targets: facts.images.map((i) => t(i.ref, i.name)) },
  },
  {
    id: 'pdfs-accessible', area: 'Content', course: C.pdfs,
    title: 'Linked PDFs are tagged for accessibility',
    why: 'The Finalsite checker does not open PDFs. Every document you link must pass Adobe Acrobat’s own Accessibility Checker.',
    steps: ['Open each PDF in Adobe Acrobat and run Tools, Accessibility, Full Check.', 'Fix what it reports, or ask the document’s owner for an accessible version.', 'Replace the file in your Finalsite gallery so the link stays the same.'],
    run: ({ facts }) => {
      const pdfs = facts.links.filter((l) => /\.pdf(\?|#|$)/i.test(l.href) || /resource-manager\/view/.test(l.href) && /\.pdf/i.test(l.text + l.raw))
      const fileLinks = pdfs.length ? pdfs : facts.links.filter((l) => /resource-manager\/view/.test(l.href))
      return fileLinks.length === 0
        ? { status: 'pass', detail: 'No documents are linked from this page.', targets: [] }
        : { status: 'review', detail: `${fileLinks.length} document${fileLinks.length === 1 ? ' is' : 's are'} linked. Confirm each passes Acrobat’s Accessibility Checker.`, items: fileLinks.slice(0, 15).map((l) => l.text || l.href), targets: fileLinks.slice(0, 15).map((l) => t(l.ref, l.text || 'Document')) }
    },
  },
  {
    id: 'left-nav', area: 'Navigation', course: C.navStandards,
    title: 'The left navigation menu is on the page',
    why: 'District standard requires the left nav on all department pages. It gives visitors access to every sub-page and section.',
    steps: ['In Compose Mode, click the building block icon, then Page Appearance, then Left Banner.', 'Set the left nav tier: Tier 2 for main department pages, Tier 3 for sub-pages.', 'Publish, then check every sub-page appears in the menu.'],
    run: ({ facts }) => facts.leftNav && facts.leftNav.links > 0
      ? { status: 'pass', detail: 'The left navigation menu is on the page.', targets: [] }
      : { status: 'fail', detail: 'No left navigation menu was found on this page.', targets: [] },
  },
  {
    id: 'overview-label', area: 'Navigation', course: C.navChecking,
    title: 'The Overview page is labeled with the department name',
    why: 'In a large district site, a menu item called just "Overview" or "Home" does not tell visitors which department they reached.',
    steps: ['Open the Overview page settings in Composer.', 'Rename it with your department name or initials before "Overview", for example "OC Overview".', 'Publish the page.'],
    run: ({ facts }) => {
      if (!facts.leftNav) return { status: 'review', detail: 'No left menu was found, so the Overview label could not be checked.', targets: [] }
      const g = facts.leftNav.genericLabels
      return g.length === 0
        ? { status: 'pass', detail: 'No menu item is labeled only "Overview" or "Home".', targets: [] }
        : { status: 'fail', detail: `The menu has an item labeled only "${g[0].text}".`, targets: g.map((x) => t(x.ref, `"${x.text}"`)) }
    },
  },
  {
    id: 'working-links', area: 'Navigation', course: C.navStandards,
    title: 'All hyperlinks are working',
    why: 'Every link on your department site must work. Broken links are flagged in audits and leave visitors at a dead end.',
    steps: ['Open each link listed here.', 'Relink it with the site page or file option (not a pasted address) so it keeps working when pages move.', 'Remove the link if the destination no longer exists.'],
    run: ({ facts, brokenLinks, linksChecked }) => {
      if (brokenLinks.length === 0) return { status: 'pass', detail: `${linksChecked} link${linksChecked === 1 ? '' : 's'} checked; none are broken.`, targets: [] }
      const byHref = new Map(facts.links.map((l) => [l.href.split('#')[0], l]))
      return { status: 'fail', detail: `${brokenLinks.length} link${brokenLinks.length === 1 ? ' goes' : 's go'} to a page that no longer exists.`, items: brokenLinks.map((b) => `${byHref.get(b.href)?.text || b.href} (${b.status})`), targets: brokenLinks.map((b) => t(byHref.get(b.href)?.ref, byHref.get(b.href)?.text || 'Broken link')) }
    },
  },
  {
    id: 'site-page-links', area: 'Navigation', course: C.navChecking,
    title: 'Internal links use site page links, not copied URLs',
    why: 'Links made with Finalsite’s site page option update themselves when a page moves. Addresses copied from the browser break when pages are renamed.',
    steps: ['Right-click each pinned link and choose Edit Link.', 'Change the link type to Site Page (or Site File) and pick the page from the list.', 'Save and publish.'],
    run: ({ facts }) => {
      const pasted = facts.links.filter((l) => SITE_HOST.test(l.raw) && !/\/fs\/resource-manager\//.test(l.raw))
      return pasted.length === 0
        ? { status: 'pass', detail: 'Internal links use site page links.', targets: [] }
        : { status: 'fail', detail: `${pasted.length} internal link${pasted.length === 1 ? ' uses' : 's use'} a copied browardschools.com address.`, items: pasted.map((l) => l.text || l.raw), targets: pasted.map((l) => t(l.ref, l.text || 'Copied URL')) }
    },
  },
]

// ── Accessibility: the scan, limited to what a WCM fixes ─────────────────
// One row per rule the WCM owns, passing when the scan found none of it.
// Template-level rules (the header, menus, footer) are Finalsite's and are
// reported separately; rules missing from the glossary are treated the same
// way, because an unknown rule is not something the course taught.
export const A11Y_ROWS: { axeIds: string[]; title: string; course: CourseRef }[] = [
  { axeIds: ['image-alt', 'role-img-alt', 'input-image-alt'], title: 'Every image has alt text', course: C.altText },
  { axeIds: ['heading-order', 'empty-heading', 'page-has-heading-one'], title: 'Headings are in order, with none skipped or empty', course: C.accessiblePage },
  { axeIds: ['link-name'], title: 'Every link has readable text', course: C.linkLanguage },
  { axeIds: ['listitem', 'list'], title: 'Lists use the list buttons, not typed bullets', course: C.accessiblePage },
  { axeIds: ['th-has-data-cells', 'td-has-header', 'table-duplicate-name', 'empty-table-header'], title: 'Data tables have a header row', course: C.accessiblePage },
  { axeIds: ['color-contrast'], title: 'Text has enough contrast', course: C.accessiblePage },
  { axeIds: ['label', 'select-name'], title: 'Form fields have labels', course: C.adaIntro },
  { axeIds: ['video-caption'], title: 'Videos have captions', course: C.adaIntro },
]

export interface AxeLikeViolation { id: string; impact: string | null; description: string; help?: string; helpUrl?: string; nodeCount: number; nodes?: { target: string; html: string }[] }

/** inContent says whether an axe selector points inside the department's own content area (#fsPageContent); template elements never count. */
export function accessibilityRows(violations: AxeLikeViolation[], inContent: (sel: string) => boolean, own: { headingSkips?: StdFacts['headingSkips'] } = {}): { rows: CheckResult[]; finalsite: AxeLikeViolation[] } {
  const finalsite: AxeLikeViolation[] = []
  const used = new Set<string>()
  const rows: CheckResult[] = A11Y_ROWS.map((row) => {
    const hits = violations.filter((v) => row.axeIds.includes(v.id))
    hits.forEach((v) => used.add(v.id))
    // Only elements in the WCM's content area count against them.
    const nodes = hits.flatMap((v) => (v.nodes ?? []).filter((n) => inContent(n.target)).map((n) => ({ v, n })))
    const entry = lookupAxeEntry(row.axeIds[0])
    const steps = entry?.fixSteps ?? []
    // Headings: our own reading-order check is the main signal; axe adds to it.
    if (row.axeIds.includes('heading-order') && own.headingSkips?.length) {
      const sk = own.headingSkips
      const say = (h: (typeof sk)[number]) => h.text ? `"${h.text}" is a Heading ${h.to} right after a Heading ${h.from}; make it a Heading ${Math.min(h.to, h.from + 1)}.` : `An empty Heading ${h.to}; delete it or add its text.`
      return {
        id: `a11y-${row.axeIds[0]}`, area: 'Accessibility', title: row.title, status: 'fail',
        detail: sk.length === 1 ? say(sk[0]) : `${sk.length} headings skip a level or are empty.`,
        items: sk.length > 1 ? sk.slice(0, 10).map(say) : undefined,
        targets: sk.slice(0, 10).map((h) => ({ label: h.text || 'Empty heading', ref: h.ref })),
        why: entry?.definition ?? '', steps, course: row.course,
      }
    }
    if (nodes.length === 0) return { id: `a11y-${row.axeIds[0]}`, area: 'Accessibility', title: row.title, status: 'pass', detail: 'The scan found no problems of this kind in your content.', targets: [], why: entry?.definition ?? '', steps, course: row.course }
    const total = hits.reduce((n, v) => n + v.nodeCount, 0)
    return {
      id: `a11y-${row.axeIds[0]}`, area: 'Accessibility', title: row.title, status: 'fail',
      detail: `The scan found ${total} element${total === 1 ? '' : 's'} to fix${total > nodes.length ? ` (${nodes.length} pinned)` : ''}.`,
      items: nodes.slice(0, 10).map(({ n }) => n.html.replace(/\s+/g, ' ').slice(0, 120)),
      targets: nodes.slice(0, 10).map(({ n }) => ({ label: row.title, selector: n.target })),
      why: entry?.definition ?? '', steps, course: row.course,
    }
  })
  for (const v of violations) {
    if (used.has(v.id)) {
      // A WCM rule whose only hits sit in the template is Finalsite's too.
      if (!(v.nodes ?? []).some((n) => inContent(n.target))) finalsite.push(v)
      continue
    }
    finalsite.push(v)
  }
  return { rows, finalsite }
}

// ── Putting it together ──────────────────────────────────────────────────
/** homepage=false (a sub-page of the site) leaves out the Homepage-only standards. */
export function runStandards(ctx: StdContext, opts: { homepage?: boolean } = {}): CheckResult[] {
  const homepage = opts.homepage ?? true
  return STANDARD_CHECKS.filter((c) => homepage || c.area !== 'Homepage').map((c) => {
    let r: Pick<CheckResult, 'status' | 'detail' | 'items' | 'targets'>
    try { r = c.run(ctx) } catch (e) { r = { status: 'review', detail: `This check could not run on this page (${e instanceof Error ? e.message : 'error'}); look at it by hand.`, targets: [] } }
    return { id: c.id, area: c.area, title: c.title, why: c.why, steps: c.steps, course: c.course, ...r }
  })
}

export function scoreOf(results: CheckResult[]) {
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const review = results.filter((r) => r.status === 'review').length
  const total = passed + failed
  return { passed, failed, review, total, score: total ? Math.round((passed / total) * 100) : 100 }
}

/** Same-site and external page links worth checking for 404s. */
export function linksToCheck(facts: StdFacts, max = 40): string[] {
  const seen = new Set<string>()
  for (const l of facts.links) {
    if (!/^https?:/i.test(l.href)) continue
    const u = l.href.split('#')[0]
    if (u) seen.add(u)
    if (seen.size >= max) break
  }
  return Array.from(seen)
}

/** HEAD first, GET if refused. Only 404 and 410 count: timeouts and bot blocks are not the WCM's broken link. */
export async function findBrokenLinks(urls: string[]): Promise<{ href: string; status: number }[]> {
  const check = async (href: string) => {
    const attempt = async (method: string) => {
      const ctl = new AbortController()
      const tm = setTimeout(() => ctl.abort(), 8000)
      try { return (await fetch(href, { method, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (BCPS MarComm department audit)' } })).status }
      catch { return 0 } finally { clearTimeout(tm) }
    }
    let s = await attempt('HEAD')
    if (s === 405 || s === 403 || s === 0) s = await attempt('GET')
    return { href, status: s }
  }
  const out: { href: string; status: number }[] = []
  for (let i = 0; i < urls.length; i += 6) out.push(...await Promise.all(urls.slice(i, i + 6).map(check)))
  return out.filter((r) => r.status === 404 || r.status === 410)
}

// ── In the browser: facts, pins and screenshots ──────────────────────────
export interface PageCapture {
  facts: StdFacts
  desktopShot: Buffer | null
  mobileShot: Buffer | null
  desktopSize: { w: number; h: number }
  mobileSize: { w: number; h: number }
  /** True when an axe selector is inside #fsPageContent (the WCM's content). */
  inContent: (sel: string) => boolean
  /** Resolve pins for these results in place (desktop + mobile rects). */
  place: (results: CheckResult[]) => void
}

const RECTS_SCRIPT = (keys: string[]) => `(() => {
  const keys = ${JSON.stringify(keys)}
  const out = {}
  for (const k of keys) {
    let el = null
    try { el = k.startsWith('ref:') ? document.querySelector('[data-audit-ref="' + k.slice(4) + '"]') : document.querySelector(k.slice(4)) } catch (e) {}
    if (!el) { out[k] = null; continue }
    const r = el.getBoundingClientRect()
    out[k] = (r.width || r.height) ? { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } : null
  }
  return out
})()`

const keyOf = (tg: CheckTarget) => (tg.ref ? `ref:${tg.ref}` : tg.selector ? `sel:${tg.selector}` : '')

/**
 * Called with the loaded page after the axe scan. Collects facts, scrolls to
 * load lazy images, takes a desktop and a phone screenshot and records where
 * every element sits in each, so pins can be resolved after the checks run.
 */
/**
 * scope 'dept': only #fsPageContent counts as the WCM's (the district
 * template around it is Finalsite's). scope 'school': everything except the
 * site header and footer counts, since a school homepage is built from
 * elements the school's WCM places (Sean, 2026-10-07, Silver Ridge test).
 */
export async function capturePage(page: Page, axeSelectors: string[], opts: { scope?: 'dept' | 'school' } = {}): Promise<PageCapture> {
  const facts = await page.evaluate(COLLECT_STANDARDS_SCRIPT) as StdFacts
  const ownTest = opts.scope === 'school'
    ? `!el.closest('#fsHeader, #fsFooter, .fsHeader, .fsFooter, header[role="banner"], footer[role="contentinfo"], body > header, body > footer')`
    : `!!el.closest('#fsPageContent')`
  const contentSelectors = new Set(await page.evaluate(`(() => ${JSON.stringify(axeSelectors)}.filter((s) => { try { const el = document.querySelector(s); return !!(el && ${ownTest}) } catch (e) { return false } }))()`) as string[])
  const refKeys = (() => {
    const s = new Set<string>()
    const add = (r?: string) => r && s.add(`ref:${r}`)
    facts.multiColumn.forEach((m) => add(m.ref)); add(facts.first?.ref); facts.contentImages.forEach((i) => add(i.ref)); facts.images.forEach((i) => add(i.ref))
    facts.buttons.forEach((b) => add(b.ref)); add(facts.contact?.ref); facts.leftNav?.genericLabels.forEach((g) => add(g.ref)); facts.links.forEach((l) => add(l.ref)); facts.longBlocks.forEach((b) => add(b.ref)); facts.headingSkips.forEach((h) => add(h.ref))
    axeSelectors.forEach((sel) => s.add(`sel:${sel}`))
    return Array.from(s)
  })()

  const shoot = async () => {
    // Step down the page so lazy-loaded images render before the capture.
    await page.evaluate(`(async () => { const h = document.body.scrollHeight; for (let y = 0; y < h; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) } scrollTo(0, 0) })()`)
    await new Promise((r) => setTimeout(r, 500))
    const size = await page.evaluate(`({ w: document.documentElement.scrollWidth, h: Math.min(document.documentElement.scrollHeight, 16000) })`) as { w: number; h: number }
    const rects = await page.evaluate(RECTS_SCRIPT(refKeys)) as Record<string, Rect | null>
    let shot: Buffer | null = null
    try { shot = Buffer.from(await page.screenshot({ type: 'jpeg', quality: 60, fullPage: true, captureBeyondViewport: true })) } catch (e) { console.error('[capturePage] screenshot failed', e) }
    return { size, rects, shot }
  }

  const desktop = await shoot()
  // Width only: switching isMobile makes Puppeteer reload the page, which
  // would wipe the data-audit-ref markers the pins depend on.
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 })
  await new Promise((r) => setTimeout(r, 900))
  facts.overflowAt375 = await page.evaluate(`document.documentElement.scrollWidth > window.innerWidth + 2`) as boolean
  const mobile = await shoot()

  return {
    facts,
    desktopShot: desktop.shot, mobileShot: mobile.shot,
    desktopSize: desktop.size, mobileSize: mobile.size,
    inContent: (sel) => contentSelectors.has(sel),
    place: (results) => {
      for (const r of results) for (const tg of r.targets) {
        const k = keyOf(tg)
        tg.desktop = k ? desktop.rects[k] ?? null : null
        tg.mobile = k ? mobile.rects[k] ?? null : null
      }
    },
  }
}
