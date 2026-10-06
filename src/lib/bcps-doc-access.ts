// src/lib/bcps-doc-access.ts
// Shared access + lookup helpers for BCPS documents served at
// /playbooks/[playbook] and /playbooks/[playbook]/[doc] (canon-bcps-doc-url-standard,
// Sean locked 2026-09-03). Access semantics are identical to /briefs/[slug]:
// public unless bcps_brief_recipients has rows for the slug, in which case the
// session email must be on the list or be a wcm_cert_users admin.
//
// Documents live in public.briefings (brand_slug = 'bcps'):
//   type = 'playbook'  -> the Playbook page, slug = playbook slug
//   type = 'record'    -> a doc under a Playbook, metadata.parent_playbook_slug required
// Slugs are globally unique, so any doc can be resolved by slug alone and
// redirected to its canonical /playbooks/[parent]/[slug] location.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  // Explicit no-store fetch: Next patches global fetch and can cache supabase-js
  // GETs even on force-dynamic routes (see src/lib/supabase-admin.ts for the incident).
  return createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}

export async function getSessionEmail(): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null
    const cookieStore = await cookies()
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  } catch {
    return null
  }
}

export async function isAdminEmail(db: SupabaseClient, email: string | null): Promise<boolean> {
  if (!email) return false
  try {
    const { data } = await db
      .from('wcm_cert_users')
      .select('is_admin')
      .ilike('email', email)
      .eq('is_admin', true)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * True when the doc belongs to a document series (Meeting Notes catalog,
 * acl_objects kind='document_series') and this person holds a grant on that
 * series, directly or through a group. Series notes are meant for the whole
 * series audience, not just the people who attended one session (Sean,
 * 2026-10-06: every Department WCM can open every Hot Lab, that is the point
 * of the notes). This is the same gate the Meeting Notes catalog uses, so a
 * note that shows in someone's list always opens for them.
 */
export async function hasSeriesGrant(db: SupabaseClient, slug: string, email: string | null): Promise<boolean> {
  if (!email) return false
  try {
    const { data: doc } = await db.from('acl_objects').select('series_id').eq('kind', 'document').eq('slug', slug).maybeSingle()
    const seriesId = doc?.series_id as string | null | undefined
    if (!seriesId) return false
    const { data: acct } = await db.from('wcm_cert_users').select('user_id').ilike('email', email).not('user_id', 'is', null).limit(1).maybeSingle()
    const userId = acct?.user_id as string | undefined
    if (!userId) return false
    const [{ data: grants }, { data: gm }] = await Promise.all([
      db.from('acl_grants').select('subject_type, subject_id').eq('object_id', seriesId),
      db.from('acl_group_members').select('group_id').eq('user_id', userId),
    ])
    const groups = new Set((gm ?? []).map((g: { group_id: string }) => g.group_id))
    return (grants ?? []).some((g: { subject_type: string; subject_id: string }) =>
      (g.subject_type === 'user' && g.subject_id === userId) || (g.subject_type === 'group' && groups.has(g.subject_id)))
  } catch {
    return false
  }
}

/**
 * Public unless recipients exist; then the session email must be listed, an
 * admin, or hold a grant on the doc's series (see hasSeriesGrant).
 */
export async function checkDocAccess(db: SupabaseClient, slug: string): Promise<{ restricted: boolean; allowed: boolean }> {
  const { data: recipients } = await db
    .from('bcps_brief_recipients')
    .select('attendee_email')
    .eq('brief_slug', slug)
  const restricted = !!recipients && recipients.length > 0
  if (!restricted) return { restricted: false, allowed: true }
  const sessionEmail = await getSessionEmail()
  const allowed = recipients!.map((r: { attendee_email: string }) => r.attendee_email.toLowerCase())
  const onList = !!sessionEmail && allowed.includes(sessionEmail.toLowerCase())
  if (onList) return { restricted: true, allowed: true }
  if (await isAdminEmail(db, sessionEmail)) return { restricted: true, allowed: true }
  return { restricted: true, allowed: await hasSeriesGrant(db, slug, sessionEmail) }
}

export interface BcpsDoc {
  slug: string
  type: 'playbook' | 'record'
  title: string | null
  content: string
  updated_at: string | null
  parent_playbook_slug: string | null
}

export async function getBcpsDoc(db: SupabaseClient, slug: string): Promise<BcpsDoc | null> {
  const { data, error } = await db
    .from('briefings')
    .select('slug, type, title, content, updated_at, metadata')
    .eq('brand_slug', 'bcps')
    .eq('slug', slug)
    .in('type', ['playbook', 'record'])
    .maybeSingle()
  if (error || !data) return null
  const meta = (data.metadata ?? {}) as Record<string, unknown>
  return {
    slug: data.slug,
    type: data.type as 'playbook' | 'record',
    title: data.title ?? null,
    content: data.content ?? '',
    updated_at: data.updated_at ?? null,
    parent_playbook_slug: typeof meta.parent_playbook_slug === 'string' ? meta.parent_playbook_slug : null,
  }
}

/** Canonical client-facing path for a doc or playbook, per the standard. */
export function canonicalPath(doc: BcpsDoc): string {
  if (doc.type === 'playbook') return `/playbooks/${doc.slug}`
  return `/playbooks/${doc.parent_playbook_slug ?? 'unfiled'}/${doc.slug}`
}
