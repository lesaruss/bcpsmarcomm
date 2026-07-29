import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Resolves who the current bcpsmarcomm.com user is, for the site-wide
// SiteFeedback widget to auto-fill "reporting as" instead of asking them
// to retype their email. Looks up wcm_cert_users (the shared identity
// table since the July 28 unified-auth change) by user_id, falling back
// to the auth session's email if there is no profile row yet. Returns
// 200 with identified: false when there is no session at all (pre-login
// pages), so the widget can fall back to a plain manual email field.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ identified: false })

  try {
    const asUser = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    })
    const { data: { user } } = await asUser.auth.getUser()
    if (!user) return NextResponse.json({ identified: false })

    const { data: profile } = await svc
      .from('wcm_cert_users')
      .select('full_name, department, email')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({
      identified: true,
      full_name: profile?.full_name || null,
      department: profile?.department || null,
      email: profile?.email || user.email || null,
    })
  } catch {
    return NextResponse.json({ identified: false })
  }
}
