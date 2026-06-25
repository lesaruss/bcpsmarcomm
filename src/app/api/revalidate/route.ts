// src/app/api/revalidate/route.ts
// POST /api/revalidate
// Called by the lesaruss-hq Admin API after writing content for this brand.
// Purges Next.js cache for the specified path so SSR pages show fresh content.

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-revalidate-token')
  const adminToken = process.env.LESARUSS_ADMIN_TOKEN

  if (!adminToken || token !== adminToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { path?: string; brand?: string; surface?: string } = {}
  try { body = await req.json() } catch {}

  const path = body.path ?? '/'

  try {
    revalidatePath(path)
    // Also revalidate root in case layout is cached
    if (path !== '/') revalidatePath('/')
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  return NextResponse.json({ revalidated: true, path })
}
