import type { SupabaseClient } from '@supabase/supabase-js'

// Signed links for a banner upload in the private bcps-client bucket: one to
// preview inline, and one that downloads the original full-resolution file
// under a readable name (Vanessa Deslandes, 2026-09-29: the District Web
// Team needs to pull approved files to post on school sites, and a
// right-click on a 30-minute preview link was the only way to do it).
// Shared by the Review Queue and School Profiles so both name files the same.
const PREVIEW_TTL = 60 * 30
const DOWNLOAD_TTL = 60 * 60

function slug(s: string | null | undefined): string {
  return (s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60)
}

export function bannerDownloadName(row: { school_name?: string | null; banner_title?: string | null; file_name?: string | null; submitted_at?: string | null }): string {
  const ext = (row.file_name?.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
  const date = row.submitted_at ? row.submitted_at.slice(0, 10) : ''
  const parts = [slug(row.school_name), slug(row.banner_title) || 'banner', date].filter(Boolean)
  return `${parts.join('_')}.${ext}`
}

export async function signBannerFile(
  svc: SupabaseClient,
  row: { file_path: string; school_name?: string | null; banner_title?: string | null; file_name?: string | null; submitted_at?: string | null },
): Promise<{ signed_url: string | null; download_url: string | null }> {
  const bucket = svc.storage.from('bcps-client')
  const [preview, download] = await Promise.all([
    bucket.createSignedUrl(row.file_path, PREVIEW_TTL),
    bucket.createSignedUrl(row.file_path, DOWNLOAD_TTL, { download: bannerDownloadName(row) }),
  ])
  return { signed_url: preview.data?.signedUrl ?? null, download_url: download.data?.signedUrl ?? null }
}

// New Upload limits, shared by /api/banner/upload-url and /api/banner/submit.
// Spec (Sean + Vanessa Deslandes): PNG/JPG, or MP4 up to 30 seconds, 1080p
// recommended. 50 MB fits a 30-second 1080p MP4 and stays at Supabase's default
// per-file upload limit.
export const BANNER_MAX_BYTES = 50 * 1024 * 1024
export const BANNER_ALLOWED_MIME: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
}

// Every New Upload lives under its uploader's own folder; submit refuses a
// path outside the caller's prefix.
export function bannerUploadPrefix(userId: string): string {
  return `banner-submissions/${userId}/`
}
