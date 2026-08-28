// lib/sitemap-crawl.ts
//
// Discovers the page URLs on a school's site for a full-site ADA scan.
// Per Sean 2026-08-28: sitemap.xml only for v1 (not a full link crawl) -
// fast, cheap, matches what FinalSite publishes on essentially every BCPS
// school site. Falls back to just the homepage when no sitemap is found,
// rather than guessing at URLs.
//
// Capped at MAX_URLS (30) for v1: each discovered URL costs a real axe-core
// + WAVE scan (WAVE is a metered API, 3 credits/scan), so an uncapped crawl
// of a large high school site could burn a surprising number of credits in
// one click. Raise the cap once WAVE's credit budget is confirmed.

const MAX_URLS = 30
const MAX_SUB_SITEMAPS = 5
const FETCH_TIMEOUT_MS = 15_000

export type SitemapDiscovery = {
  urls: string[]
  source: 'sitemap' | 'homepage-fallback'
  truncated: boolean
  sitemapUrl: string | null
}

function extractLocs(xml: string): string[] {
  const matches = xml.match(/<loc>([^<]+)<\/loc>/gi) ?? []
  return matches
    .map(m => m.replace(/<\/?loc>/gi, '').trim())
    .filter(Boolean)
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/**
 * Discover a school's page URLs via /sitemap.xml. Handles a sitemap index
 * (a sitemap of sitemaps) by fetching up to MAX_SUB_SITEMAPS of the listed
 * sub-sitemaps and merging their <loc> entries. Falls back to just the
 * homepage when no sitemap is reachable or parseable.
 */
export async function discoverSchoolPages(rootUrl: string): Promise<SitemapDiscovery> {
  let root: URL
  try {
    root = new URL(rootUrl)
  } catch {
    return { urls: [rootUrl], source: 'homepage-fallback', truncated: false, sitemapUrl: null }
  }

  const sitemapUrl = new URL('/sitemap.xml', root.origin).toString()
  const xml = await fetchText(sitemapUrl)

  if (!xml) {
    return { urls: [root.origin + '/'], source: 'homepage-fallback', truncated: false, sitemapUrl }
  }

  const isIndex = /<sitemapindex/i.test(xml)
  let urls: string[] = []

  if (isIndex) {
    const subSitemaps = extractLocs(xml).slice(0, MAX_SUB_SITEMAPS)
    for (const sub of subSitemaps) {
      if (urls.length >= MAX_URLS) break
      const subXml = await fetchText(sub)
      if (subXml) urls.push(...extractLocs(subXml))
    }
  } else {
    urls = extractLocs(xml)
  }

  // De-dupe, keep same-origin only (a sitemap shouldn't list off-domain
  // pages, but don't trust that blindly), drop obvious non-HTML assets.
  const seen = new Set<string>()
  const filtered: string[] = []
  for (const u of urls) {
    try {
      const parsed = new URL(u)
      if (parsed.origin !== root.origin) continue
      if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|docx?|xlsx?)$/i.test(parsed.pathname)) continue
      if (seen.has(u)) continue
      seen.add(u)
      filtered.push(u)
    } catch {
      // skip malformed entries
    }
  }

  if (filtered.length === 0) {
    return { urls: [root.origin + '/'], source: 'homepage-fallback', truncated: false, sitemapUrl }
  }

  const truncated = filtered.length > MAX_URLS
  return { urls: filtered.slice(0, MAX_URLS), source: 'sitemap', truncated, sitemapUrl }
}
