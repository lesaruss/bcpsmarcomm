// app/api/bcps/campaigns/route.ts
//
// Campaign tracking for the Analytics page. A campaign is a named push
// (Referendum 2026, Open Enrollment, ...) that Marcomm shares a link for and
// then needs three numbers against: unique visitors, page views, and average
// time on page.
//
// GET    /api/bcps/campaigns            - campaigns + their latest metrics
// POST   /api/bcps/campaigns            - create
// PATCH  /api/bcps/campaigns            - update (id in body)
// DELETE /api/bcps/campaigns?id=...     - delete (metrics cascade)
//
// Gated on requireBcpsSuperAdmin, which is the same check that already guards
// the analytics data these rows belong to: /api/bcps/analytics uses it, and
// SUPERADMIN_PAGES puts 'analytics' behind it in the shell. Per
// canon-gate-new-surfaces-on-the-same-check, the guarding check is named here
// rather than re-derived.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// Accepts a full URL or a bare path and returns the GA4 pagePath form.
//
// GA4 records pagePath, never the hostname, so a campaign configured with
// "https://www.browardschools.com/referendum2026" has to become
// "/referendum2026" or it will match nothing and report a silent zero.
function toPagePath(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  let path = s
  if (/^https?:\/\//i.test(s)) {
    try { path = new URL(s).pathname } catch { return null }
  }
  if (!path.startsWith('/')) path = '/' + path
  path = path.replace(/\/+$/, '')
  return path || '/'
}

function normalizePaths(input: unknown): string[] {
  const list = Array.isArray(input)
    ? input
    : String(input ?? '').split(/[\n,]/)
  const out: string[] = []
  for (const item of list) {
    const p = toPagePath(String(item))
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { searchParams } = new URL(req.url)
    const period = searchParams.get('period')
    const includeArchived = searchParams.get('includeArchived') === '1'

    let q = supabase.from('bcps_campaigns').select('*').order('sort_order').order('name')
    if (!includeArchived) q = q.eq('status', 'active')
    const { data: campaigns, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const ids = (campaigns ?? []).map(c => c.id)
    let metrics: Record<string, unknown>[] = []
    if (ids.length) {
      // Newest period first; the first row seen per campaign wins, so a
      // requested period pins the answer and otherwise it is the latest sync.
      let mq = supabase
        .from('bcps_campaign_analytics')
        .select('*')
        .in('campaign_id', ids)
        .order('period', { ascending: false })
      if (period) mq = mq.eq('period', period)
      const { data } = await mq
      metrics = data ?? []
    }

    const latest = new Map<string, Record<string, unknown>>()
    for (const m of metrics) {
      const key = m.campaign_id as string
      if (!latest.has(key)) latest.set(key, m)
    }

    // Daily series for the trend chart. Bounded by `days` so a long-running
    // campaign cannot return an unbounded payload.
    const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '30', 10) || 30, 7), 365)
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const dailyByCampaign = new Map<string, Record<string, unknown>[]>()
    if (ids.length) {
      const { data: daily } = await supabase
        .from('bcps_campaign_daily')
        .select('campaign_id,date,unique_visitors,page_views,sessions,engagement_seconds')
        .in('campaign_id', ids)
        .gte('date', since)
        .order('date')
      for (const row of (daily ?? [])) {
        const key = row.campaign_id as string
        if (!dailyByCampaign.has(key)) dailyByCampaign.set(key, [])
        dailyByCampaign.get(key)!.push(row)
      }
    }

    // Every available period, so the UI can offer a period picker without a
    // second round trip.
    const periods = Array.from(new Set(metrics.map(m => m.period as string))).sort().reverse()

    return NextResponse.json({
      campaigns: (campaigns ?? []).map(c => ({
        ...c,
        metrics: latest.get(c.id) ?? null,
        daily: dailyByCampaign.get(c.id) ?? [],
      })),
      periods,
      days,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Campaign name is required.' }, { status: 400 })

  const page_paths = normalizePaths(body.page_paths)
  if (page_paths.length === 0) {
    return NextResponse.json({ error: 'At least one page URL or path is required.' }, { status: 400 })
  }

  const slug = slugify(String(body.slug ?? '') || name)
  if (!slug) return NextResponse.json({ error: 'Could not derive a slug from that name.' }, { status: 400 })

  const { data, error } = await supabase.from('bcps_campaigns').insert({
    name,
    slug,
    page_paths,
    primary_url: body.primary_url ? String(body.primary_url).trim() : null,
    description: body.description ? String(body.description).trim() : null,
    owner: body.owner ? String(body.owner).trim() : null,
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    include_subpages: body.include_subpages !== false,
    sort_order: Number(body.sort_order ?? 0) || 0,
  }).select('*').single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A campaign with the slug "${slug}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ campaign: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }) }

  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined)        updates.name = String(body.name).trim()
  if (body.primary_url !== undefined) updates.primary_url = body.primary_url ? String(body.primary_url).trim() : null
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null
  if (body.owner !== undefined)       updates.owner = body.owner ? String(body.owner).trim() : null
  if (body.start_date !== undefined)  updates.start_date = body.start_date || null
  if (body.end_date !== undefined)    updates.end_date = body.end_date || null
  if (body.sort_order !== undefined)  updates.sort_order = Number(body.sort_order) || 0
  if (body.include_subpages !== undefined) updates.include_subpages = body.include_subpages !== false
  if (body.status !== undefined) {
    const status = String(body.status)
    if (status !== 'active' && status !== 'archived') {
      return NextResponse.json({ error: 'status must be active or archived.' }, { status: 400 })
    }
    updates.status = status
  }
  if (body.page_paths !== undefined) {
    const page_paths = normalizePaths(body.page_paths)
    if (page_paths.length === 0) {
      return NextResponse.json({ error: 'At least one page URL or path is required.' }, { status: 400 })
    }
    updates.page_paths = page_paths
  }

  const { data, error } = await supabase.from('bcps_campaigns')
    .update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  const { error } = await supabase.from('bcps_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
