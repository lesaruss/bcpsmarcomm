// app/api/admin/_auth.ts
import { NextRequest, NextResponse } from 'next/server'

/**
 * Middleware to verify ADMIN_TOKEN for admin API routes.
 * Returns a 401 response if token is invalid, otherwise returns null.
 */
export function requireAdminToken(req: NextRequest): NextResponse | null {
  const token = req.headers.get('x-admin-token') || process.env.ADMIN_TOKEN
  
  if (!token) {
    return NextResponse.json(
      { error: 'ADMIN_TOKEN not configured.' },
      { status: 500 }
    )
  }

  const provided = req.headers.get('x-admin-token')
  if (!provided || provided !== token) {
    return NextResponse.json(
      { error: 'Unauthorized. Invalid or missing x-admin-token header.' },
      { status: 401 }
    )
  }

  return null
}
