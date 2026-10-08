import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// Server-only plumbing shared by /api/proud-points/*: the same caller check
// and service-role client every /api/banner route builds for itself.

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
