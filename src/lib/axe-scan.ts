// lib/axe-scan.ts
//
// Real axe-core accessibility scan via a real headless Chromium browser.
// Ported from lesaruss-hq's lib/axe-scan.ts (V's "gold standard" ADA pass:
// Lighthouse + axe-core + WAVE) on 2026-08-19, per V's direction to stop
// using PageSpeed-only results for the BCPS ADA Scanner and switch to the
// same proven stack already live elsewhere. Portable/vendored as-is: this
// function takes an arbitrary URL string, no brand-slug binding.

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor' | null

// One occurrence of a violation on the page - where it actually is, not
// just that it exists. `target` is axe's CSS selector path to the element
// (joined for iframe-nested targets); `html` is a truncated snippet of the
// element itself, so a WCM can Ctrl+F their page source for it.
export type AxeNode = {
  target: string
  html: string
  failureSummary: string | null
}

export type AxeViolation = {
  id: string
  impact: AxeImpact
  description: string
  help: string
  helpUrl: string
  nodeCount: number
  nodes: AxeNode[]
}

// Cap per violation so a rule that hits 200 elements on one page doesn't
// bloat the stored JSON or the finding card - nodeCount above still carries
// the true total, this just limits how many sample locations we keep.
const MAX_NODES_PER_VIOLATION = 10
// Element HTML can run long (e.g. an entire nav with all its children) -
// truncated to keep the snippet skimmable and the stored row small.
const MAX_HTML_SNIPPET = 300

export type AxeCounts = { critical: number; serious: number; moderate: number; minor: number }

export type AxeScanResult = {
  ok: boolean
  error?: string
  violations: AxeViolation[]
  counts: AxeCounts
  adaScore: number | null
}

// Read axe-core's bundled UMD build so it can be injected via CDP
// page.evaluate() rather than a <script> tag, which the target site's CSP
// would otherwise block.
//
// Root-caused 2026-08-19: `require.resolve('axe-core/axe.min.js')` looked
// right locally, but under Next's webpack build it gets rewritten at
// COMPILE time into a bundler-internal module id (a plain number, e.g.
// `1300`) even though @sparticuz/chromium/puppeteer-core/axe-core are all
// marked serverComponentsExternalPackages - require.resolve itself isn't
// covered by that setting. fs.readFileSync(1300) then fails with the
// misleading "EBADF: bad file descriptor, read" instead of a clear
// "not a string" error. Building the path manually from process.cwd()
// (which is the Lambda's /var/task root at runtime) sidesteps
// require.resolve entirely; outputFileTracingIncludes in next.config.js
// ensures this exact file ships with the ada-scan route's Lambda.
function loadAxeSource(): string {
  const p = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')
  if (!fs.existsSync(p)) {
    throw new Error(`axe-core bundle not found at ${p} - check next.config.js outputFileTracingIncludes`)
  }
  return fs.readFileSync(p, 'utf8')
}

export async function runAxeScan(url: string): Promise<AxeScanResult> {
  let browser: import('puppeteer-core').Browser | null = null
  try {
    const executablePath = await chromium.executablePath()
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    })
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })

    const axeSource = loadAxeSource()
    await page.evaluate(axeSource)
    const results = await page.evaluate(async () => {
      // @ts-expect-error injected global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      })
    }) as {
      violations: Array<{
        id: string; impact: AxeImpact; description: string; help: string; helpUrl: string
        nodes: Array<{ target: string[]; html: string; failureSummary?: string | null }>
      }>
    }

    const violations: AxeViolation[] = results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodeCount: v.nodes.length,
      nodes: v.nodes.slice(0, MAX_NODES_PER_VIOLATION).map(n => ({
        target: n.target.join(' '),
        html: n.html.length > MAX_HTML_SNIPPET ? n.html.slice(0, MAX_HTML_SNIPPET) + '…' : n.html,
        failureSummary: n.failureSummary ?? null,
      })),
    }))

    const counts: AxeCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    for (const v of violations) {
      if (v.impact === 'critical') counts.critical++
      else if (v.impact === 'serious') counts.serious++
      else if (v.impact === 'moderate') counts.moderate++
      else counts.minor++
    }

    const adaScore = Math.max(0, 100 - (counts.critical * 15 + counts.serious * 10 + counts.moderate * 5 + counts.minor * 2))

    return { ok: true, violations, counts, adaScore }
  } catch (err) {
    console.error('[runAxeScan] failed', err instanceof Error ? err.stack : err)
    return {
      ok: false,
      error: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
      violations: [],
      counts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      adaScore: null,
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
