import { readFileSync } from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

// Portals Project mockup of the Parents & Families page (2026-10-21), shared
// with the team and the Department WCM beta testers before anything is built
// in Finalsite. Same bar as /playbooks/: any BCPS MarComm sign-in. The
// middleware already sends signed-out visitors to /login (this path is not in
// its isPublic list); the session check here is the same check repeated, so
// the page stays closed even if that list changes. The HTML lives in
// src/mockups/, not public/, so it cannot be fetched as a static file.
export const dynamic = 'force-dynamic'

const FILE = path.join(process.cwd(), 'src/mockups/parents-families.html')

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const login = new URL('/login', req.nextUrl.origin)
    login.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(login)
  }
  const html = readFileSync(FILE, 'utf8')
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
