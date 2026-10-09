import { NextRequest } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase-admin'

// Server-only plumbing shared by /api/proud-points/*.
//
// Who may use Proud Points: everyone in the district. It is embedded on the
// Finalsite WCM Community page and announced in a communique, so most school
// WCMs reach it with no bcpsmarcomm.com account. Two ways in:
// - signed in to bcpsmarcomm.com (Authorization: Bearer <supabase token>);
// - the embed, no sign-in: a signed guest key per browser
//   (X-Proud-Points-Token), see below.
// Submissions and photos belong to an owner_key: the member's email, or
// 'guest:<key>' for the embed.

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

// ---- Embed guest key ----
// The embed has no sign-in (Sean, 2026-10-09: it sits on the Finalsite WCM
// Community page like the other widgets). Each browser gets a random guest
// key, HMAC-signed so it cannot be guessed or forged, which owns that
// browser's drafts and photos. The person types a name and a district email
// when sending; that email gets the status emails. Nothing reaches a school
// site without District Web Team review, and rateLimit() caps photos and
// sends per connection. The key is derived from the service role key, so
// there is no extra secret to store.
const EMBED_KEY = crypto.createHash('sha256').update(`${SERVICE}:proud-points-embed:v1`).digest()
const DISTRICT_EMAIL = /^[^@\s]+@browardschools\.com$/i

export function isDistrictEmail(email: string): boolean {
  return DISTRICT_EMAIL.test(email.trim())
}

export function newGuestToken(): string {
  const body = Buffer.from(JSON.stringify({ g: crypto.randomBytes(16).toString('hex') })).toString('base64url')
  const sig = crypto.createHmac('sha256', EMBED_KEY).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyGuestToken(token: string): string | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = crypto.createHmac('sha256', EMBED_KEY).update(body).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
  try {
    const { g } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { g?: string }
    return g && /^[0-9a-f]{32}$/.test(g) ? g : null
  } catch {
    return null
  }
}

export interface PPIdent {
  owner: string // owner_key: a signed-in member's lowercase email, or 'guest:<key>'
  email: string | null // known only when signed in; a guest types it when sending
  userId: string | null
  user: User | null
  via: 'session' | 'guest'
}

// Every /api/proud-points route except review checks this. Embed guests pass
// with a valid guest key. Signed-in members pass when they hold a district
// email, sit on the District Web Team, or are a BCPS admin.
export async function requireProudPointsAccess(req: NextRequest): Promise<{ ident: PPIdent; status: 200 } | { ident: null; status: 401 | 403 }> {
  const guest = req.headers.get('x-proud-points-token')
  if (guest) {
    const key = verifyGuestToken(guest)
    return key ? { ident: { owner: `guest:${key}`, email: null, userId: null, user: null, via: 'guest' }, status: 200 } : { ident: null, status: 401 }
  }
  const user = await caller(req)
  if (!user || !user.email) return { ident: null, status: 401 }
  const email = user.email.trim().toLowerCase()
  const ident: PPIdent = { owner: email, email, userId: user.id, user, via: 'session' }
  if (isDistrictEmail(email)) return { ident, status: 200 }
  const [{ data: roleRow }, { data: gm }] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle(),
    svc.from('acl_group_members').select('group_id, acl_groups!inner(name, brand)').eq('user_id', user.id)
      .eq('acl_groups.brand', 'bcps').eq('acl_groups.name', 'District Web Team'),
  ])
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin' || (gm ?? []).length > 0) return { ident, status: 200 }
  return { ident: null, status: 403 }
}

export function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

// Caps per connection per hour, so an open form cannot be used to flood the
// bucket or the review queue. Signed-in members are not limited.
export const LIMITS = { photos: 60, sends: 10 } as const
export async function rateLimited(table: 'bcps_proud_point_photos' | 'bcps_proud_point_submissions', ip: string, max: number): Promise<boolean> {
  const since = new Date(Date.now() - 3600e3).toISOString()
  let q = svc.from(table).select('created_at', { count: 'exact', head: true }).eq('client_ip', ip).gte('created_at', since)
  if (table === 'bcps_proud_point_submissions') q = q.neq('status', 'draft')
  const { count } = await q
  return (count ?? 0) >= max
}

export const ACCESS_ERROR = { 401: 'Please reload the page and try again.', 403: 'Proud Points is for Broward County Public Schools staff.' } as const

// Photos live under a folder per owner, hashed so the bucket path carries
// neither an address nor a guest key.
export function ownerFolder(owner: string): string {
  return `proud-points/${crypto.createHash('sha256').update(owner.trim().toLowerCase()).digest('hex').slice(0, 24)}/`
}
