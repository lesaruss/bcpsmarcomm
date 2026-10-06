import { NextRequest, NextResponse } from 'next/server'
import { auditDepartmentPage } from '@/lib/dept-audit-run'

// Dry run of department audit v3 for testing check logic against live
// department pages before a release. Saves nothing. Exists only on Vercel
// preview deployments (which sit behind Vercel's own login); production and
// local builds answer 404.
export const dynamic = 'force-dynamic'
export const maxDuration = 240

export async function GET(req: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = req.nextUrl.searchParams.get('url') || ''
  const dept = req.nextUrl.searchParams.get('dept') || ''
  if (!/^https:\/\/www\.browardschools\.com\//.test(url)) return NextResponse.json({ error: 'url must be a browardschools.com page' }, { status: 400 })
  const out = await auditDepartmentPage(url, dept)
  if (!out.ok) return NextResponse.json(out, { status: 502 })
  const { desktopShot, mobileShot, violations, ...rest } = out
  return NextResponse.json({
    ...rest,
    shots: { desktopBytes: desktopShot?.length ?? 0, mobileBytes: mobileShot?.length ?? 0 },
    violationIds: violations.map((v) => `${v.id} (${v.nodeCount})`),
  })
}
