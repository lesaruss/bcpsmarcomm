// src/app/api/bcps/registrations/route.ts
// Rolls up every "someone signed up / submitted something" flow on the site
// into one feed for the SuperAdmin "Registrations" nav item:
//   - course:        wcm_cert_users        (WCM cert-course sign-ups)
//   - director:       bcps_wcm_roster_submissions (director roster submissions)
//   - certification:  wcm_certifications    (issued certifications)
// Superadmin-only. Auth matches /api/bcps/access-requests: session bearer
// token + acl_member_roles check for brand 'bcps', not the older hardcoded
// access_key pattern used by wcm-roster-queue.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getSessionUser() {
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
    return user
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'DB unavailable' }, { status: 503 })

  const { data: roleRow } = await db
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('brand', 'bcps')
    .maybeSingle()

  if (roleRow?.role !== 'superadmin' && roleRow?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [usersRes, subsRes, certsRes] = await Promise.all([
    db.from('wcm_cert_users')
      .select('user_id, email, full_name, department, created_at')
      .eq('is_admin', false)
      .order('created_at', { ascending: false }),
    db.from('bcps_wcm_roster_submissions')
      .select('id, department_name, director_name, wcm_name, wcm_email, submitter_name, submitter_email, submitted_at, status, action, identity_flag')
      .order('submitted_at', { ascending: false }),
    db.from('wcm_certifications')
      .select('user_id, issued_at, expires_at'),
  ])

  const err = usersRes.error || subsRes.error || certsRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const certByUser = new Map((certsRes.data ?? []).map(c => [c.user_id, c]))

  const course = (usersRes.data ?? []).map(u => ({
    type: 'course' as const,
    id: `course-${u.user_id}`,
    name: u.full_name || u.email,
    email: u.email,
    department: u.department ?? null,
    status: certByUser.has(u.user_id) ? 'certified' : 'in-progress',
    date: u.created_at,
    detail: null as Record<string, unknown> | null,
  }))

  const director = (subsRes.data ?? []).map(s => ({
    type: 'director' as const,
    id: `director-${s.id}`,
    name: s.wcm_name || s.submitter_name || s.director_name || 'Unnamed submission',
    email: s.wcm_email || s.submitter_email || null,
    department: s.department_name,
    status: s.status,
    date: s.submitted_at,
    detail: { director_name: s.director_name, action: s.action, identity_flag: s.identity_flag },
  }))

  const certification = (usersRes.data ?? [])
    .filter(u => certByUser.has(u.user_id))
    .map(u => {
      const c = certByUser.get(u.user_id)!
      return {
        type: 'certification' as const,
        id: `cert-${u.user_id}`,
        name: u.full_name || u.email,
        email: u.email,
        department: u.department ?? null,
        status: 'certified',
        date: c.issued_at,
        detail: { expires_at: c.expires_at },
      }
    })

  const items = [...course, ...director, ...certification].sort(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  )

  return NextResponse.json({
    counts: {
      all: items.length,
      course: course.length,
      director: director.length,
      certification: certification.length,
      director_pending: director.filter(d => d.status === 'pending').length,
    },
    items,
  })
}
