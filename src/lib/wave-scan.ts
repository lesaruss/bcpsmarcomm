// lib/wave-scan.ts
//
// Real WAVE (WebAIM) accessibility scan - the third leg of the "gold
// standard" ADA pass (Lighthouse + axe-core + WAVE). Ported from
// lesaruss-hq's lib/wave-scan.ts on 2026-08-19, adapted to read
// WAVE_API_KEY from this project's own Vercel env vars (bcpsmarcomm has no
// lesaruss_secrets table of its own) rather than a Supabase secrets lookup.
//
// Uses reporttype=4 (CSS selectors, full item detail) - costs 3 API credits
// per scan rather than reporttype=1's 1 credit, matching the itemized depth
// of the axe-core pass.

export type WaveViolation = {
  category: 'error' | 'contrast' | 'alert'
  id: string
  description: string
  count: number
}

export type WaveScanResult = {
  ok: boolean
  error?: string
  waveScore: number | null // AIMscore (0-10) scaled to 0-100, matching ada_score's scale
  violations: WaveViolation[]
  creditsRemaining?: number
}

type WaveCategoryItem = { id: string; description: string; count: number }
type WaveCategory = { description: string; count: number; items?: Record<string, WaveCategoryItem> }
type WaveApiResponse = {
  status?: { success?: boolean; httpstatuscode?: number }
  statistics?: {
    AIMscore?: number
    creditsremaining?: number
    allitemcount?: number
    totalelements?: number
    waveurl?: string
  }
  categories?: {
    error?: WaveCategory
    contrast?: WaveCategory
    alert?: WaveCategory
    feature?: WaveCategory
    structure?: WaveCategory
    aria?: WaveCategory
  }
}

export async function runWaveScan(url: string): Promise<WaveScanResult> {
  const key = process.env.WAVE_API_KEY
  if (!key) {
    return { ok: false, error: 'WAVE_API_KEY missing from environment', waveScore: null, violations: [] }
  }

  const requestUrl =
    `https://wave.webaim.org/api/request?key=${encodeURIComponent(key)}` +
    `&reporttype=4&format=json&url=${encodeURIComponent(url)}`

  let json: WaveApiResponse
  try {
    const resp = await fetch(requestUrl, { signal: AbortSignal.timeout(45_000) })
    json = await resp.json()
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      waveScore: null,
      violations: [],
    }
  }

  if (!json.status?.success) {
    return { ok: false, error: 'WAVE API reported failure for this URL', waveScore: null, violations: [] }
  }

  const violations: WaveViolation[] = []
  for (const cat of ['error', 'contrast', 'alert'] as const) {
    const category = json.categories?.[cat]
    if (!category?.items) continue
    for (const item of Object.values(category.items)) {
      violations.push({ category: cat, id: item.id, description: item.description, count: item.count })
    }
  }

  const aim = json.statistics?.AIMscore
  const waveScore = typeof aim === 'number' ? Math.round(aim * 10) : null

  return {
    ok: true,
    waveScore,
    violations,
    creditsRemaining: json.statistics?.creditsremaining,
  }
}
