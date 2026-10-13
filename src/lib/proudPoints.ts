// Proud Points Submission App - shared rules, types and server helpers.
// Built 2026-10-08 from the Vanessa Deslandes + Rudy Carril call: replaces the
// Microsoft Form "School Proud Points for Website" with the same pattern as
// the banner app (BannerWidget, /api/banner/*).
//
// Rules (Vanessa, 2026-10-08):
// - A school without six points on record sends all six; the form keeps a
//   draft until all six are complete.
// - A school with six replaces one at a time. Replacing is the removal.
// - Each point: a data point, a heading and a caption.
//
// Round 2 (Vanessa, 2026-10-12):
// - Who sends all six is the 25/26 website audit list (bcps_proud_point_audit,
//   27 schools), not the old form's sheet. Everyone else replaces one.
// - The data point is only the big number or grade ("98%", "#1", "20+", "A"),
//   never words: "A rated" or "20+ scholars" is refused (STAT_PATTERN).
// - One background photo per school: the homepage section shows a single
//   photo behind all six points, so the photo belongs to the submission, not
//   to each point. Sending all six needs it; a replacement may include a new
//   one.
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

// The data point: a number (optional # or $, commas, decimals, then %, +, K,
// M or B), a ratio like 1:1, or a letter grade A to F with + or -. Typing
// keeps a character only while the value is still the start of one of those,
// so words and spaces cannot be entered: "A rated" stays "A", "20+ scholars"
// stays "20+".
export const STAT_PATTERN = /^(?:[A-DF][+-]?|[#$]?\d[\d,]*(?:\.\d+)?(?:%|[KMB])?\+?|\d+:\d+)$/
const STAT_PARTIAL = /^(?:[A-DF][+-]?|[#$]{0,2}|[#$]?\d[\d,]*(?:\.\d*)?(?:%|[KMB])?\+?|\d+:\d*)$/
export const STAT_RULE = 'Only the big number or grade, like 98%, #1, 20+, 1:1 or A. Put the words in the heading.'
export function cleanStatInput(v: string): string {
  let out = ''
  for (const c of v.toUpperCase()) {
    if (out.length >= STAT_MAX) break
    if (STAT_PARTIAL.test(out + c)) out += c
  }
  return out
}
export function statOk(v: string): boolean {
  return STAT_PATTERN.test(v.trim())
}

// PENDING: Vanessa's Proud Points photo dimensions. Banner rules until then.
export const PHOTO_MIN_WIDTH = 1920
export const PHOTO_MIN_HEIGHT = 800
export const PHOTO_MAX_BYTES = 50 * 1024 * 1024
export const PHOTO_ALLOWED_MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' }
export const PHOTO_RULES_PENDING = true

export interface ProudPoint {
  slot: number
  stat: string
  heading: string
  caption: string
}

// The one background photo behind all six points.
export interface BackgroundPhoto {
  path: string | null
  name: string | null
  alt: string
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
  if (complete && stat && !statOk(stat)) return `Data point ${p.slot}: ${STAT_RULE}`
  if (heading.length > HEADING_MAX) return `Heading ${p.slot}: ${HEADING_MAX} characters at most.`
  if (caption.length > CAPTION_MAX) return `Caption ${p.slot}: ${CAPTION_MAX} characters at most.`
  if (!complete) return null
  if (!stat) return `Point ${p.slot} needs a data point.`
  if (!heading) return `Point ${p.slot} needs a heading.`
  if (!caption) return `Point ${p.slot} needs a caption.`
  return null
}

export function cleanPhoto(p: Partial<BackgroundPhoto> | null | undefined): BackgroundPhoto {
  return { path: p?.path || null, name: (p?.name || '').slice(0, 200) || null, alt: (p?.alt || '').trim().slice(0, 250) }
}

export function cleanPoint(p: Partial<ProudPoint>, slot: number): ProudPoint {
  return {
    slot,
    stat: (p.stat || '').trim().slice(0, STAT_MAX),
    heading: (p.heading || '').trim().slice(0, HEADING_MAX),
    caption: (p.caption || '').trim().slice(0, CAPTION_MAX),
  }
}

// What a school shows today, and whether it already has six.
// Points shown: an approved app submission (initial, then replacements on
// top), else the old form's last complete set of six.
// has_six, in order: the District Web Team's override for the school
// (bcps_proud_point_schools); then the 25/26 audit list (a listed school
// needs all six until a full set is approved here; any other school has
// six); then, only if the audit table is empty, the record.
export async function schoolState(svc: SupabaseClient, locNo: string): Promise<{
  has_six: boolean
  override: boolean | null
  on_audit_list: boolean
  current: CurrentPoint[]
  current_photo_path: string | null
  current_source: 'app' | 'legacy' | 'none'
  legacy_points: { text: string; submitted_at: string | null }[]
  legacy_count: number
}> {
  const [{ data: override }, { data: audit }, { count: auditSize }, { data: approved }, { data: legacy }] = await Promise.all([
    svc.from('bcps_proud_point_schools').select('has_six').eq('loc_no', locNo).maybeSingle(),
    svc.from('bcps_proud_point_audit').select('loc_no').eq('loc_no', locNo).maybeSingle(),
    svc.from('bcps_proud_point_audit').select('loc_no', { count: 'exact', head: true }),
    svc.from('bcps_proud_point_submissions')
      .select('kind, points, replace_slot, photo_path, reviewed_at, submitted_at')
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
  let photoPath: string | null = null
  const app = approved ?? []
  const lastInitial = app.map(a => a.kind).lastIndexOf('initial')
  if (lastInitial >= 0) {
    source = 'app'
    photoPath = app[lastInitial].photo_path ?? null
    current = (app[lastInitial].points as ProudPoint[]).map(p => ({ slot: p.slot, source: 'app' as const, stat: p.stat, heading: p.heading, caption: p.caption }))
    for (const a of app.slice(lastInitial + 1)) {
      if (a.photo_path) photoPath = a.photo_path
      if (a.kind !== 'replace' || !a.replace_slot) continue
      const p = (a.points as ProudPoint[])[0]
      if (!p) continue
      current = current.filter(c => c.slot !== a.replace_slot)
      current.push({ slot: a.replace_slot, source: 'app', stat: p.stat, heading: p.heading, caption: p.caption })
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
  const fullAppSet = source === 'app' && current.length >= POINT_COUNT
  const onList = !!audit
  const computed = (auditSize ?? 0) > 0
    ? (fullAppSet || !onList)
    : (source === 'app' ? fullAppSet : legacyCount >= POINT_COUNT)
  const ov = override ? !!override.has_six : null
  return {
    has_six: ov ?? computed,
    override: ov,
    on_audit_list: onList,
    current,
    current_photo_path: photoPath,
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
