// Proud Points Submission App - shared rules, types and server helpers.
// Built 2026-10-08 from the Vanessa Deslandes + Rudy Carril call: replaces the
// Microsoft Form "School Proud Points for Website" with the same pattern as
// the banner app (BannerWidget, /api/banner/*).
//
// Rules (Vanessa, 2026-10-08):
// - A school without six points on record sends all six; the form keeps a
//   draft until all six are complete.
// - A school with six replaces one at a time. Replacing is the removal.
// - Each point: a data point, a heading, a caption, and a background photo.
//
// Character limits are ours, set from the old form's 1,326 points (median
// 95 characters in one free-text box, 90th percentile 215): the data point is
// the big number, the heading and caption match the banner title/caption
// limits Vanessa set 2026-10-02. Change them here only; the widget and the
// submit route both read these.
//
// Photo rules: Vanessa owes the Proud Points background dimensions. Until
// then the banner upload rules apply (PNG/JPG, 1920 x 800 or larger, 50 MB).

import type { SupabaseClient, User } from '@supabase/supabase-js'

export const STAT_MAX = 10
export const HEADING_MAX = 40
export const CAPTION_MAX = 115
export const POINT_COUNT = 6

// PENDING: Vanessa's Proud Points photo dimensions. Banner rules until then.
export const PHOTO_MIN_WIDTH = 1920
export const PHOTO_MIN_HEIGHT = 800
export const PHOTO_MAX_BYTES = 50 * 1024 * 1024
export const PHOTO_ALLOWED_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }
export const PHOTO_RULES_PENDING = true

export function proudPointUploadPrefix(userId: string): string {
  return `proud-points/${userId}/`
}

export interface ProudPoint {
  slot: number
  stat: string
  heading: string
  caption: string
  photo_path: string | null
  photo_name: string | null
  alt_text: string
}

export type SubmissionKind = 'initial' | 'replace'
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface CurrentPoint {
  slot: number
  source: 'app' | 'legacy'
  // App points carry the three fields; legacy points are one free-text box.
  stat?: string
  heading?: string
  caption?: string
  text?: string
  photo_path?: string | null
}

// Fixed rejection reasons, kept in sync with ProudPointsWidget.
export const FIXED_REJECT_REASONS = [
  'Photo dimensions or quality',
  'Embedded text or logos in the photo',
  'Faces blurred, erased, or covered',
  'Data point needs a source or is unclear',
  'Wording or spelling needs changes',
]

export function isValidRejectionReason(reason: string): boolean {
  if (FIXED_REJECT_REASONS.includes(reason)) return true
  const m = reason.match(/^Other:\s*([\s\S]+)$/)
  return !!m && m[1].trim().length > 0
}

// A Vercel preview deploy is the test build: what it creates is marked as a
// test, and emails that would go to the District Web Team go to the tester.
export function isTestBuild(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.PROUD_POINTS_TEST === '1'
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function isReviewer(svc: SupabaseClient, user: User): Promise<'admin' | 'manager' | null> {
  // Same reviewer list as banners (bcps_banner_admins), which Vanessa manages
  // from the Banner Submissions page: one team, one list.
  const { data } = await svc.from('bcps_banner_admins').select('role').eq('user_id', user.id).maybeSingle()
  return (data?.role as 'admin' | 'manager' | undefined) ?? null
}

export function validatePoint(p: Partial<ProudPoint>, { complete }: { complete: boolean }): string | null {
  const stat = (p.stat || '').trim()
  const heading = (p.heading || '').trim()
  const caption = (p.caption || '').trim()
  if (stat.length > STAT_MAX) return `Data point ${p.slot}: ${STAT_MAX} characters at most.`
  if (heading.length > HEADING_MAX) return `Heading ${p.slot}: ${HEADING_MAX} characters at most.`
  if (caption.length > CAPTION_MAX) return `Caption ${p.slot}: ${CAPTION_MAX} characters at most.`
  if (!complete) return null
  if (!stat) return `Point ${p.slot} needs a data point.`
  if (!heading) return `Point ${p.slot} needs a heading.`
  if (!caption) return `Point ${p.slot} needs a caption.`
  if (!p.photo_path) return `Point ${p.slot} needs a background photo.`
  if (!(p.alt_text || '').trim()) return `Point ${p.slot} needs a photo description (alt text).`
  return null
}

export function cleanPoint(p: Partial<ProudPoint>, slot: number): ProudPoint {
  return {
    slot,
    stat: (p.stat || '').trim().slice(0, STAT_MAX),
    heading: (p.heading || '').trim().slice(0, HEADING_MAX),
    caption: (p.caption || '').trim().slice(0, CAPTION_MAX),
    photo_path: p.photo_path || null,
    photo_name: p.photo_name || null,
    alt_text: (p.alt_text || '').trim().slice(0, 250),
  }
}

// What a school shows today, and whether it already has six.
// Order of truth: an approved app submission (initial, then replacements on
// top), else the old form's last complete set of six. has_six can be forced
// by the District Web Team (bcps_proud_point_schools) because the old sheet
// is incomplete for some schools.
export async function schoolState(svc: SupabaseClient, locNo: string): Promise<{
  has_six: boolean
  override: boolean | null
  current: CurrentPoint[]
  current_source: 'app' | 'legacy' | 'none'
  legacy_points: { text: string; submitted_at: string | null }[]
  legacy_count: number
}> {
  const [{ data: override }, { data: approved }, { data: legacy }] = await Promise.all([
    svc.from('bcps_proud_point_schools').select('has_six').eq('loc_no', locNo).maybeSingle(),
    svc.from('bcps_proud_point_submissions')
      .select('kind, points, replace_slot, reviewed_at, submitted_at')
      .eq('school_location_nbr', locNo).eq('status', 'approved').is('archived_at', null)
      .order('submitted_at', { ascending: true }),
    svc.from('bcps_proud_point_legacy')
      .select('source_row, slot, text, submitted_at')
      .eq('school_location_nbr', locNo)
      .order('source_row', { ascending: true }).order('slot', { ascending: true }),
  ])

  const legacyRows = legacy ?? []
  const byRow = new Map<number, { slot: number; text: string; submitted_at: string | null }[]>()
  for (const r of legacyRows) {
    const list = byRow.get(r.source_row) ?? []
    list.push({ slot: r.slot, text: r.text, submitted_at: r.submitted_at })
    byRow.set(r.source_row, list)
  }
  // Newest first, deduplicated, for "what you sent before".
  const seen = new Set<string>()
  const legacyPoints: { text: string; submitted_at: string | null }[] = []
  for (const r of [...legacyRows].reverse()) {
    const k = r.text.trim().toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    legacyPoints.push({ text: r.text, submitted_at: r.submitted_at })
  }

  let current: CurrentPoint[] = []
  let source: 'app' | 'legacy' | 'none' = 'none'
  const app = approved ?? []
  const lastInitial = app.map(a => a.kind).lastIndexOf('initial')
  if (lastInitial >= 0) {
    source = 'app'
    current = (app[lastInitial].points as ProudPoint[]).map(p => ({ slot: p.slot, source: 'app' as const, stat: p.stat, heading: p.heading, caption: p.caption, photo_path: p.photo_path }))
    for (const a of app.slice(lastInitial + 1)) {
      if (a.kind !== 'replace' || !a.replace_slot) continue
      const p = (a.points as ProudPoint[])[0]
      if (!p) continue
      current = current.filter(c => c.slot !== a.replace_slot)
      current.push({ slot: a.replace_slot, source: 'app', stat: p.stat, heading: p.heading, caption: p.caption, photo_path: p.photo_path })
    }
    current.sort((x, y) => x.slot - y.slot)
  } else {
    const fullRows = Array.from(byRow.entries()).filter(([, pts]) => pts.filter(p => p.slot <= 6).length >= POINT_COUNT)
    const last = fullRows[fullRows.length - 1]
    if (last) {
      source = 'legacy'
      current = last[1].filter(p => p.slot <= 6).map(p => ({ slot: p.slot, source: 'legacy' as const, text: p.text }))
    }
  }

  const legacyCount = legacyRows.length
  const computed = source === 'app' ? current.length >= POINT_COUNT : legacyCount >= POINT_COUNT
  const ov = override ? !!override.has_six : null
  return {
    has_six: ov ?? computed,
    override: ov,
    current,
    current_source: source,
    legacy_points: legacyPoints.slice(0, 18),
    legacy_count: legacyCount,
  }
}

// The WCM's own schools (bcps_schools.wcm_email), so the form can default to
// theirs; any school can still be picked, the same as banners.
export async function mySchoolLocs(svc: SupabaseClient, email: string | undefined): Promise<string[]> {
  if (!email) return []
  const { data } = await svc.from('bcps_schools').select('school_location_nbr, wcm_email').not('wcm_email', 'is', null)
  const e = email.trim().toLowerCase()
  return (data ?? [])
    .filter(r => (r.wcm_email || '').trim().toLowerCase() === e && r.school_location_nbr)
    .map(r => r.school_location_nbr as string)
}

export async function signPhoto(svc: SupabaseClient, path: string | null | undefined, downloadName?: string): Promise<{ url: string | null; download_url: string | null }> {
  if (!path) return { url: null, download_url: null }
  const bucket = svc.storage.from('bcps-client')
  const [a, b] = await Promise.all([
    bucket.createSignedUrl(path, 60 * 30),
    downloadName ? bucket.createSignedUrl(path, 60 * 60, { download: downloadName }) : Promise.resolve({ data: null }),
  ])
  return { url: a.data?.signedUrl ?? null, download_url: (b as { data: { signedUrl: string } | null }).data?.signedUrl ?? null }
}
