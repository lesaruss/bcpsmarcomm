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

/** Public unless recipients exist; then session email must be listed or admin. */
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
  return { restricted: true, allowed: await isAdminEmail(db, sessionEmail) }
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
