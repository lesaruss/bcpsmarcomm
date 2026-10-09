import { NextRequest } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-admin'

// Server-only plumbing shared by /api/proud-points/*.
//
// Who may use Proud Points (Sean, 2026-10-08): everyone in the district. It
// is embedded on the Finalsite WCM Community page and announced in a
// communique, so most school WCMs reach it with no bcpsmarcomm.com account.
// Two ways in:
// - signed in to bcpsmarcomm.com (Authorization: Bearer <supabase token>);
// - the embed: a one-time code emailed to a @browardschools.com address,
//   exchanged for a signed token (X-Proud-Points-Token). Same bar as the old
//   Microsoft Form, which required a district Microsoft sign-in.
// Submissions and photos are owned by email, which both ways share.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const svc = createServiceClient(URL, SERVICE)

export async function caller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function schoolByLoc(locNo: string | undefined | null) {
  if (!locNo) return null
  const { data } = await svc.from('bcps_school_directory')
    .select('loc_no, school_name, school_level').eq('loc_no', locNo).eq('is_archived', false).maybeSingle()
  return data
}

// ---- Embed sign-in token ----
// HMAC-signed { e: email, x: expiry }. The key is derived from the service
// role key, so there is no extra secret to store or rotate separately; a
// service key rotation signs everyone out of the embed, which is fine.
const EMBED_KEY = crypto.createHash('sha256').update(`${SERVICE}:proud-points-embed:v1`).digest()
export const EMBED_TOKEN_DAYS = 30
const DISTRICT_EMAIL = /^[^@\s]+@browardschools\.com$/i

export function isDistrictEmail(email: string): boolean {
  return DISTRICT_EMAIL.test(email.trim())
}

export function signEmbedToken(email: string): string {
  const body = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), x: Date.now() + EMBED_TOKEN_DAYS * 864e5 })).toString('base64url')
  const sig = crypto.createHmac('sha256', EMBED_KEY).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyEmbedToken(token: string): string | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = crypto.createHmac('sha256', EMBED_KEY).update(body).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
  try {
    const { e, x } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: string; x?: number }
    if (!e || !x || x < Date.now() || !isDistrictEmail(e)) return null
    return e
  } catch {
    return null
  }
}

export function hashCode(email: string, code: string): string {
  return crypto.createHmac('sha256', EMBED_KEY).update(`${email.trim().toLowerCase()}:${code}`).digest('hex')
}

export interface PPIdent {
  email: string // always lowercase; the owner key for submissions and photos
  userId: string | null // set when signed in to bcpsmarcomm.com
  user: User | null
  via: 'session' | 'embed'
}

// Every /api/proud-points route except review checks this. Signed-in members
// pass when they hold a district email, sit on the District Web Team, or are
// a BCPS admin (Sean's LESARUSS account is the SuperAdmin). Embed users pass
// with a valid token, which is only ever issued to a district email.
export async function requireProudPointsAccess(req: NextRequest): Promise<{ ident: PPIdent; status: 200 } | { ident: null; status: 401 | 403 }> {
  const embed = req.headers.get('x-proud-points-token')
  if (embed) {
    const email = verifyEmbedToken(embed)
    return email ? { ident: { email, userId: null, user: null, via: 'embed' }, status: 200 } : { ident: null, status: 401 }
  }
  const user = await caller(req)
  if (!user || !user.email) return { ident: null, status: 401 }
  const ident: PPIdent = { email: user.email.trim().toLowerCase(), userId: user.id, user, via: 'session' }
  if (isDistrictEmail(user.email)) return { ident, status: 200 }
  const [{ data: roleRow }, { data: gm }] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle(),
    svc.from('acl_group_members').select('group_id, acl_groups!inner(name, brand)').eq('user_id', user.id)
      .eq('acl_groups.brand', 'bcps').eq('acl_groups.name', 'District Web Team'),
  ])
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin' || (gm ?? []).length > 0) return { ident, status: 200 }
  return { ident: null, status: 403 }
}

export const ACCESS_ERROR = { 401: 'Please sign in again.', 403: 'Proud Points is for Broward County Public Schools staff.' } as const

// Photos live under a folder per person; email is hashed so the bucket path
// does not carry an address.
export function ownerFolder(email: string): string {
  return `proud-points/${crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24)}/`
}
