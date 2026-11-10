import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasSeriesGrant } from '@/lib/bcps-doc-access'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Every Department WCM Hot Lab, for the Hot Lab library in the Department WCM
// Guide (Sean, 2026-11-10: "show all of the meetings, sortable by date and
// searchable by topic"). Same gate as the dashboard's Hot Lab card: admins and
// holders of the Hot Lab series grant (every Department WCM) see every
// session; anyone else sees only sessions with no recipient list or that list
// them. Each session carries its topic summary and the plain text of its notes
// so the library can search inside them.
const HOT_LAB_SERIES_ID = '158c496c-7964-407c-8015-4001ceddafdf'
const SEARCH_TEXT_LIMIT = 12000

const SHAREPOINT = 'https://browardcountyschools.sharepoint.com'

// The session's Teams recording on SharePoint, as an absolute file address.
// Notes embed it (embed.aspx?id=<server-relative path>) or link to it.
function recordingUrl(html: string): string | null {
  const embed = html.match(/sharepoint\.com\/[^"'\s]*?embed\.aspx\?id=([^"'&\s]+)/i)
  if (embed) {
    try { return SHAREPOINT + decodeURIComponent(embed[1]) } catch { /* fall through */ }
  }
  const stream = html.match(/sharepoint\.com\/[^"'\s]*?stream\.aspx\?id=([^"'&\s]+)/i)
  if (stream) {
    try { return SHAREPOINT + decodeURIComponent(stream[1]) } catch { /* fall through */ }
  }
  const direct = html.match(/https:\/\/browardcountyschools\.sharepoint\.com\/[^"'\s<>]+?\.mp4/i)
  return direct ? direct[0] : null
}

function plain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/i, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Missing session.' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 })
  const email = (user.email || '').trim().toLowerCase()

  const { data: docs, error } = await svc.from('acl_objects')
    .select('slug, title, description, doc_date, doc_date_sort, doc_url')
    .eq('brand', BRAND).eq('kind', 'document').eq('series_id', HOT_LAB_SERIES_ID)
    .order('doc_date_sort', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!docs?.length) return NextResponse.json({ sessions: [] })

  const slugs = docs.map((d) => d.slug as string)
  const [roleRes, adminRes, recipRes] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle(),
    svc.from('wcm_cert_users').select('is_admin').eq('user_id', user.id).eq('is_admin', true).maybeSingle(),
    svc.from('bcps_brief_recipients').select('brief_slug, attendee_email').in('brief_slug', slugs),
  ])
  const role = roleRes.data?.role as string | undefined
  const seesAll = role === 'admin' || role === 'superadmin' || !!adminRes.data || (await hasSeriesGrant(svc, slugs[0], email))
  const lists = new Map<string, string[]>()
  for (const r of recipRes.data ?? []) {
    const k = r.brief_slug as string
    lists.set(k, [...(lists.get(k) ?? []), ((r.attendee_email as string) || '').toLowerCase()])
  }
  const visible = docs.filter((d) => {
    if (seesAll) return true
    const l = lists.get(d.slug as string)
    return !l || l.includes(email)
  })
  if (!visible.length) return NextResponse.json({ sessions: [] })

  const { data: bodies } = await svc.from('briefings').select('slug, content')
    .eq('brand_slug', BRAND).in('slug', visible.map((d) => d.slug as string))
  const bodyOf = new Map((bodies ?? []).map((b) => [b.slug as string, (b.content as string) || '']))

  const sessions = visible.map((d) => {
    const html = bodyOf.get(d.slug as string) ?? ''
    const video = recordingUrl(html)
    return {
      slug: d.slug as string,
      title: d.title as string,
      date: d.doc_date_sort as string,
      summary: (d.description as string) || '',
      doc_url: (d.doc_url as string) || `/playbooks/wcm-hot-labs/${d.slug as string}`,
      // SharePoint draws a preview frame of the recording for anyone signed in
      // to their district Microsoft account; the tile falls back to a designed
      // cover when it cannot load.
      thumb: video ? `${SHAREPOINT}/_layouts/15/getpreview.ashx?path=${encodeURIComponent(video)}&resolution=3` : null,
      has_recording: !!video,
      text: plain(html).slice(0, SEARCH_TEXT_LIMIT),
    }
  })
  return NextResponse.json({ sessions }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
