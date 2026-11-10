// src/lib/bcps-doc-password.ts
// Password access for one BCPS document (Sean, 2026-11-10): "a document can
// have a password for anyone who's not a member or logged in ... they have
// 24-hour access before they have to put the password in again ... they could
// put the password in or they can log in."
//
// This is a deliberate, per-document exception to "every document needs a
// signed-in BCPS MarComm account" (bcps-doc-access.ts). It only applies to a
// document an admin has given a password in its Access panel.
//
// Storage: public.bcps_doc_passwords holds a salted scrypt hash, never the
// password. A correct password sets an HttpOnly cookie, bcps_dp_<slug>, holding
// "<expiry>.<signature>". The signature covers the slug, the expiry and the
// stored hash, so changing or removing the password ends every pass at once.

import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const PASS_HOURS = 24
const PASS_MS = PASS_HOURS * 60 * 60 * 1000
export const MIN_PASSWORD_LENGTH = 8

// Ten wrong tries in fifteen minutes locks the password for fifteen minutes.
const MAX_FAILS = 10
const FAIL_WINDOW_MS = 15 * 60 * 1000

export function passCookieName(slug: string): string {
  return `bcps_dp_${slug}`
}

function signingKey(): Buffer | null {
  const secret = process.env.DOC_PASS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return null
  return createHash('sha256').update(`bcps-doc-pass-v1:${secret}`).digest()
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$')
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function signature(slug: string, exp: number, storedHash: string): string | null {
  const key = signingKey()
  if (!key) return null
  return createHmac('sha256', key).update(`${slug}.${exp}.${storedHash}`).digest('base64url')
}

/** A new 24-hour pass for this slug, or null if no signing key is configured. */
export function makePass(slug: string, storedHash: string): { value: string; expires: Date } | null {
  const exp = Date.now() + PASS_MS
  const sig = signature(slug, exp, storedHash)
  if (!sig) return null
  return { value: `${exp}.${sig}`, expires: new Date(exp) }
}

function passIsValid(slug: string, value: string | undefined, storedHash: string): boolean {
  if (!value) return false
  const dot = value.indexOf('.')
  if (dot < 1) return false
  const exp = Number(value.slice(0, dot))
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = signature(slug, exp, storedHash)
  if (!expected) return false
  const a = Buffer.from(value.slice(dot + 1))
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface DocPasswordRow {
  slug: string
  password_hash: string
  failed_attempts: number
  failed_window_start: string | null
}

export async function getDocPassword(db: SupabaseClient, slug: string): Promise<DocPasswordRow | null> {
  try {
    const { data } = await db
      .from('bcps_doc_passwords')
      .select('slug, password_hash, failed_attempts, failed_window_start')
      .eq('slug', slug)
      .maybeSingle()
    return (data as DocPasswordRow | null) ?? null
  } catch {
    return null
  }
}

/** True when this document has a password and the request carries a live pass for it. */
export async function hasValidPass(db: SupabaseClient, slug: string): Promise<{ hasPassword: boolean; valid: boolean }> {
  const row = await getDocPassword(db, slug)
  if (!row) return { hasPassword: false, valid: false }
  let value: string | undefined
  try {
    value = (await cookies()).get(passCookieName(slug))?.value
  } catch {
    value = undefined
  }
  return { hasPassword: true, valid: passIsValid(slug, value, row.password_hash) }
}

/** Locked out after too many wrong tries; returns minutes left, or 0. */
export function lockedMinutes(row: DocPasswordRow): number {
  if (row.failed_attempts < MAX_FAILS || !row.failed_window_start) return 0
  const until = new Date(row.failed_window_start).getTime() + FAIL_WINDOW_MS
  const left = until - Date.now()
  return left > 0 ? Math.ceil(left / 60000) : 0
}

export async function recordFailure(db: SupabaseClient, row: DocPasswordRow): Promise<void> {
  const start = row.failed_window_start ? new Date(row.failed_window_start).getTime() : 0
  const fresh = !start || Date.now() - start > FAIL_WINDOW_MS
  await db.from('bcps_doc_passwords').update({
    failed_attempts: fresh ? 1 : row.failed_attempts + 1,
    failed_window_start: fresh ? new Date().toISOString() : row.failed_window_start,
  }).eq('slug', row.slug)
}

export async function clearFailures(db: SupabaseClient, slug: string): Promise<void> {
  await db.from('bcps_doc_passwords').update({ failed_attempts: 0, failed_window_start: null }).eq('slug', slug)
}

/** The briefings slug behind a /playbooks/... document address, or null. */
export function docSlugFromUrl(url: string | null | undefined): string | null {
  const m = (url || '').match(/^\/playbooks\/(?:[a-z0-9-]+\/)?([a-z0-9-]+)\/?$/)
  return m ? m[1] : null
}
