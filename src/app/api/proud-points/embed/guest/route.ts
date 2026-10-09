import { NextResponse } from 'next/server'
import { newGuestToken } from '@/lib/proudPointsApi'

// The embed's first call: a signed guest key for this browser, kept in
// localStorage and sent as X-Proud-Points-Token. No sign-in (Sean,
// 2026-10-09). The key only ever reaches its own drafts and photos.

export async function POST() {
  return NextResponse.json({ token: newGuestToken() })
}
