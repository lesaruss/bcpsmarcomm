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

export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor' | null

export type AxeViolation = {
  id: string
  impact: AxeImpact
  description: string
  help: string
  helpUrl: string
  nodes: number
}

export type AxeCounts = { critical: number; serious: number; moderate: number; minor: number }

export type AxeScanResult = {
  ok: boolean
  error?: string
  violations: AxeViolation[]
  counts: AxeCounts
  adaScore: number | null
}

// axe-core/axe.min.js resolves to a file path via require; read its source
// so it can be injected via CDP page.evaluate() rather than a <script> tag,
// which the target site's CSP would otherwise block.
function loadAxeSource(): string {
  const p = require.resolve('axe-core/axe.min.js')
  console.error('[runAxeScan] resolved axe-core path:', p, 'exists:', fs.existsSync(p))
  return fs.readFileSync(p, 'utf8')
}

export async function runAxeScan(url: string): Promise<AxeScanResult> {
  let browser: import('puppeteer-core').Browser | null = null
  try {
    console.error('[runAxeScan] step: resolving chromium executablePath')
    const executablePath = await chromium.executablePath()
    console.error('[runAxeScan] step: got executablePath', executablePath)
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 900 },
      executablePath,
      headless: true,
    })
    console.error('[runAxeScan] step: browser launched')
    const page = await browser.newPage()
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 })
    console.error('[runAxeScan] step: page loaded')

    const axeSource = loadAxeSource()
    console.error('[runAxeScan] step: axe source loaded, length', axeSource.length)
    await page.evaluate(axeSource)
    console.error('[runAxeScan] step: axe injected into page')
    const results = await page.evaluate(async () => {
      // @ts-expect-error injected global
      return await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      })
    }) as { violations: Array<{ id: string; impact: AxeImpact; description: string; help: string; helpUrl: string; nodes: unknown[] }> }

    const violations: AxeViolation[] = results.violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
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
    // Temporary verbose logging (2026-08-19) while diagnosing a live
    // "EBADF: bad file descriptor, read" failure on Vercel - remove once
    // root-caused.
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
