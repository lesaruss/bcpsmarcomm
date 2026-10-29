import { createClient } from '@supabase/supabase-js'

// Opens and clicks on tracked BCPS MarComm emails (bcps_email_tracking; the
// certification follow-up, Sean 2026-10-29). An open is the email's 1x1 image
// loading, so it undercounts when images are blocked; a click is the tracked
// link being followed, and also counts as an open. Mail scanners can follow
// links too, so the user agent of the last event is kept for judging that.
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function recordEmailEvent(token: string, kind: 'open' | 'click', userAgent: string | null): Promise<void> {
  if (!/^[a-f0-9]{36}$/.test(token)) return
  const { data: row } = await svc.from('bcps_email_tracking').select('opened_at, open_count, clicked_at, click_count').eq('token', token).maybeSingle()
  if (!row) return
  const now = new Date().toISOString()
  await svc.from('bcps_email_tracking').update({
    opened_at: row.opened_at ?? now,
    open_count: (row.open_count as number) + (kind === 'open' ? 1 : 0),
    clicked_at: kind === 'click' ? (row.clicked_at ?? now) : row.clicked_at,
    click_count: (row.click_count as number) + (kind === 'click' ? 1 : 0),
    last_user_agent: (userAgent || '').slice(0, 300) || null,
  }).eq('token', token)
}
