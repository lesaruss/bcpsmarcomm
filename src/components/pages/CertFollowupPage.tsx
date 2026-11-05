'use client'

// Certification (Sean, 2026-11-05): one page in two tabs. Overview is two
// tiles, a sortable list by status and the leaderboard. Outreach holds the
// campaigns (with the reminder preview), test sends, then the roster at the
// bottom with one tab per group (Sean, 2026-11-05, second pass).
// The course itself stays at /certification/departments.
//
// Certification follow-up (Sean, 2026-10-29): every Department WCM who has not
// finished the certification, live, grouped the way the follow-up email is
// written (90% or more, 1% to 89%, not started, no account). Each row shows
// progress, the last time they worked on it, and what happened to the email:
// sent, opened, clicked, and how far they have moved since. Refreshes every 30
// seconds. Read the drafts with Preview, send yourself a test, then send to the
// people checked. /api/bcps/cert-followup does the work; SuperAdmin only.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FOLLOWUP_GROUPS, type FollowupGroup } from '@/lib/bcps-cert-followup-groups'
import WcmLeaderboard from '@/components/guides/WcmLeaderboard'

interface Person {
  email: string
  name: string
  department: string | null
  pct: number
  has_account: boolean
  last_active: string | null
  group: FollowupGroup
  email_status: { sent_at: string; opened_at: string | null; open_count: number; clicked_at: string | null; click_count: number; pct_at_send: number | null } | null
  failed: string | null
}
interface Preview { to: string; subject: string; html: string }
interface NudgePreview {
  baseline_campaign: string
  counts: { left_to_certify: number; emailed_in_baseline: number; not_emailed_no_baseline: number; progress_moved: number; unchanged_no_account: number; recipients: number }
  recipients: { email: string; name: string; department: string | null; pct: number; last_active: string | null }[]
  subject: string
  sample: { to: string; html: string } | null
  sender: { from: string; reply_to: string }
}
interface CampaignSummary { campaign: string; sent: number; people: number; opened: number; clicked: number; first_sent: string; last_sent: string }
type View = 'overview' | 'outreach'
type GlanceSort = 'high' | 'low' | 'name' | 'active'
const byKey = (k: FollowupGroup) => FOLLOWUP_GROUPS.find((g) => g.key === k)!
// Overview chips, in Sean's order: completed, 90 to 99, below that, not started.
const GLANCE: { key: FollowupGroup; label: string }[] = [
  { key: 'completed', label: 'Completed' },
  { key: 'near', label: '90 to 99%' },
  { key: 'progress', label: '1 to 89%' },
  { key: 'not-started', label: 'Not started' },
  { key: 'no-account', label: 'No account' },
]
// Roster tabs, in the order the follow-up works through them.
const ROSTER = (['near', 'progress', 'not-started', 'no-account', 'completed'] as FollowupGroup[]).map(byKey)
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9-]{2,59}$/

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
const ENDPOINT = '/api/bcps/cert-followup'
const BLUE = '#1672A7'

function when(iso: string | null): string {
  if (!iso) return 'Never'
  const d = new Date(iso)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`
  if (mins < 24 * 60) return `${Math.round(mins / 60)} hr ago`
  const days = Math.round(mins / 1440)
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
  return days <= 7 ? `${date} (${days} day${days === 1 ? '' : 's'} ago)` : date
}
const stamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

export default function CertFollowupPage({ onShowToast }: { onShowToast?: (msg: string) => void }) {
  const toast = useCallback((m: string) => (onShowToast ? onShowToast(m) : window.alert(m)), [onShowToast])
  const [people, setPeople] = useState<Person[] | null>(null)
  const [sender, setSender] = useState<{ from: string; reply_to: string } | null>(null)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [testTo, setTestTo] = useState('sean.russell@browardschools.com')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [nudge, setNudge] = useState<NudgePreview | null>(null)
  const [err, setErr] = useState('')
  // The campaign this page is showing. Each send belongs to one campaign, so
  // several sends can be tracked on their own (Sean, 2026-11-02).
  const [campaign, setCampaign] = useState<string | null>(null)
  const [campaignText, setCampaignText] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  // Certification page layout (Sean, 2026-11-05): Overview, Outreach, Roster.
  const [view, setView] = useState<View>('overview')
  const [glance, setGlance] = useState<FollowupGroup>('completed')
  const [glanceSort, setGlanceSort] = useState<GlanceSort>('high')
  const [rosterTab, setRosterTab] = useState<FollowupGroup>('near')
  const [search, setSearch] = useState('')

  const load = useCallback(async (c: string | null) => {
    const url = c ? `${ENDPOINT}?campaign=${encodeURIComponent(c)}` : ENDPOINT
    const r = await fetch(url, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load the list.'); return }
    setErr('')
    setCampaign(j.campaign)
    setCampaignText((cur) => cur || j.campaign)
    setCampaigns(j.campaigns ?? [])
    setPeople(j.people)
    setSender(j.sender)
    setAsOf(j.as_of)
    // The first load for a campaign checks everyone not yet emailed in it.
    setPicked((cur) => cur ?? new Set((j.people as Person[]).filter((p) => !p.email_status && p.group !== 'completed').map((p) => p.email)))
  }, [])
  useEffect(() => {
    load(campaign)
    const t = setInterval(() => load(campaign), 30000)
    return () => clearInterval(t)
  }, [campaign, load])

  const pickCampaign = (raw: string) => {
    setCampaignText(raw)
    const v = raw.trim().toLowerCase()
    if (!CAMPAIGN_RE.test(v) || v === campaign) return
    setPicked(null)
    setPreview(null)
    setNudge(null)
    setCampaign(v)
  }

  const post = async (payload: object) => {
    setBusy(true)
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ campaign, ...payload }) })
      return { ok: r.ok, j: await r.json().catch(() => ({})) }
    } finally { setBusy(false) }
  }
  const openPreview = async (email: string) => {
    const { ok, j } = await post({ action: 'preview', email })
    if (ok) setPreview(j as Preview); else toast(j.error || 'Could not load the preview.')
  }
  const previewNudge = async () => {
    const { ok, j } = await post({ action: 'nudge-preview' })
    if (ok) setNudge(j as NudgePreview); else toast(j.error || 'Could not build the nudge preview.')
  }
  const sendTest = async (group: FollowupGroup) => {
    const { ok, j } = await post({ action: 'test', to: testTo, group })
    toast(ok ? `Test sent to ${testTo}, written as it would read for ${j.as}.` : (j.error || 'Could not send the test.'))
  }
  const sendPicked = async () => {
    if (!picked?.size) return
    if (!window.confirm(`Send to ${picked.size} ${picked.size === 1 ? 'person' : 'people'} in campaign "${campaign}"? Each gets the version for their group. Replies go to ${sender?.reply_to}.`)) return
    const { ok, j } = await post({ action: 'send', emails: Array.from(picked) })
    if (!ok) { toast(j.error || 'Could not send.'); return }
    const skipped = j.skipped?.length ? ` Skipped ${j.skipped.length} already emailed in this campaign.` : ''
    toast((j.failed?.length ? `Sent ${j.sent}. ${j.failed.length} failed: ${j.failed.map((f: { email: string }) => f.email).join(', ')}.` : `Sent ${j.sent} follow-up email${j.sent === 1 ? '' : 's'}.`) + skipped)
    setPicked(new Set())
    load(campaign)
  }
  const toggle = (email: string) => setPicked((p) => { const n = new Set(p ?? []); if (n.has(email)) n.delete(email); else n.add(email); return n })
  const toggleGroup = (rows: Person[], on: boolean) => setPicked((p) => { const n = new Set(p ?? []); rows.forEach((r) => (on ? n.add(r.email) : n.delete(r.email))); return n })

  if (err && !people) return <div style={{ padding: 32 }}>{err}</div>
  if (!people) return <div style={{ padding: 32 }}>Loading certification...</div>

  const count = (g: FollowupGroup) => people.filter((p) => p.group === g).length
  const certifiedCount = count('completed')
  const bar = (pct: number) => (
    <div className="cert-bar" role="img" aria-label={`${pct}% complete`}>
      <div style={{ width: `${pct}%`, background: pct >= 100 ? '#16750C' : pct >= 90 ? '#16750C' : BLUE }} />
    </div>
  )

  // Overview tile: one status at a time, sorted the way Sean picks.
  const glanceRows = people
    .filter((p) => p.group === glance)
    .sort((a, b) => {
      if (glanceSort === 'name') return a.name.localeCompare(b.name)
      if (glanceSort === 'active') return (b.last_active ?? '').localeCompare(a.last_active ?? '')
      if (glanceSort === 'low') return a.pct - b.pct || a.name.localeCompare(b.name)
      return b.pct - a.pct || a.name.localeCompare(b.name)
    })

  // Roster tab: one group per tab, with a name search.
  const q = search.trim().toLowerCase()
  const rosterRows = people
    .filter((p) => p.group === rosterTab)
    .filter((p) => !q || `${p.name} ${p.email} ${p.department ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
  const allOn = rosterRows.length > 0 && rosterRows.every((r) => picked?.has(r.email))

  const VIEWS: { key: View; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'outreach', label: 'Outreach' },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Certification</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Department WCM certification, live. {certifiedCount} of {people.length} certified. The District Web Team is left out.
            Updated {asOf ? when(asOf).toLowerCase() : ''}; refreshes every 30 seconds.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-outline" href="/certification/departments" target="_blank" rel="noopener">Open the course</a>
          <a className="btn btn-outline" href="/certification/departments/admin" target="_blank" rel="noopener">Submissions</a>
        </div>
      </div>

      <div className="cert-tabs" role="tablist" aria-label="Certification sections">
        {VIEWS.map((v) => (
          <button key={v.key} id={`cert-tab-${v.key}`} role="tab" type="button" className="cert-tab" aria-selected={view === v.key} aria-controls={`cert-panel-${v.key}`} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {view === 'overview' && (
        <div id="cert-panel-overview" role="tabpanel" aria-labelledby="cert-tab-overview" className="cert-ov">
          <section className="home-dept" aria-labelledby="cert-glance-title">
            <div className="cert-ov-head">
              <h3 id="cert-glance-title" className="home-card-title" style={{ margin: 0 }}>Where everyone is</h3>
              <span className="cert-ov-big"><b>{glanceRows.length}</b>{GLANCE.find((g) => g.key === glance)?.label.toLowerCase()}</span>
            </div>
            <div className="cert-subtabs" role="group" aria-label="Show">
              {GLANCE.map((g) => (
                <button key={g.key} type="button" className="cert-chip" aria-pressed={glance === g.key} onClick={() => setGlance(g.key)}>
                  {g.label} · {count(g.key)}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              Sort
              <select className="form-input" style={{ maxWidth: 220, padding: '4px 8px', fontSize: 13 }} value={glanceSort} onChange={(e) => setGlanceSort(e.target.value as GlanceSort)}>
                <option value="high">Progress, highest first</option>
                <option value="low">Progress, lowest first</option>
                <option value="name">Name, A to Z</option>
                <option value="active">Last worked on it</option>
              </select>
            </label>
            <div className="lb-list lb-scroll cert-scroll" role="list" aria-label={GLANCE.find((g) => g.key === glance)?.label}>
              {glanceRows.length === 0 && <div className="lb-row" role="listitem"><span /><span className="lb-who"><span>Nobody here right now.</span></span><span /></div>}
              {glanceRows.map((p) => (
                <div className="lb-row" role="listitem" key={p.email} style={{ gridTemplateColumns: '1fr auto' }}>
                  <span className="lb-who"><b>{p.name}</b><span>{p.department ?? p.email}{p.has_account ? ` · ${when(p.last_active)}` : ' · No account'}</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {bar(p.pct)}
                    <strong style={{ fontSize: 13, minWidth: 38, textAlign: 'right' }}>{p.pct}%</strong>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="home-dept" aria-labelledby="cert-lb-title">
            <div className="cert-ov-head">
              <h3 id="cert-lb-title" className="home-card-title" style={{ margin: 0 }}>Leaderboard</h3>
              <span className="cert-ov-big">Top 20 · points</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0 }}>Certification, Hot Labs, Kickoff and audit points.</p>
            <WcmLeaderboard boardOnly />
          </section>
        </div>
      )}

      {view === 'outreach' && (
        <div id="cert-panel-outreach" role="tabpanel" aria-labelledby="cert-tab-outreach">
          <div className="invite-form-card">
            <h4>Campaigns</h4>
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>Every send is saved under a campaign. Pick one to see its list and results, or type a new campaign name below to start one. Names use lowercase letters, numbers and dashes.</p>
            <div className="invite-table-wrap">
              <table className="invite-table">
                <thead>
                  <tr><th>Campaign</th><th>People</th><th>Sent</th><th>Opened</th><th>Open rate</th><th>Clicked</th><th>Click rate</th><th>Last sent</th></tr>
                </thead>
                <tbody>
                  {campaigns.length === 0 && <tr><td colSpan={8} style={{ opacity: 0.7 }}>No campaign has sent yet.</td></tr>}
                  {campaigns.map((c) => (
                    <tr key={c.campaign} onClick={() => pickCampaign(c.campaign)} style={{ cursor: 'pointer', background: c.campaign === campaign ? '#eef6fb' : undefined }}>
                      <td style={{ fontWeight: 700 }}>{c.campaign}</td>
                      <td>{c.people}</td>
                      <td>{c.sent}</td>
                      <td>{c.opened}</td>
                      <td>{c.sent ? `${Math.round((c.opened / c.sent) * 100)}%` : '–'}</td>
                      <td>{c.clicked}</td>
                      <td>{c.sent ? `${Math.round((c.clicked / c.sent) * 100)}%` : '–'}</td>
                      <td style={{ fontSize: 12 }}>{stamp(c.last_sent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 700 }} htmlFor="cf-campaign">Campaign</label>
              <input id="cf-campaign" className="form-input" style={{ maxWidth: 320 }} list="cf-campaign-list" value={campaignText} onChange={(e) => pickCampaign(e.target.value)} aria-describedby="cf-campaign-help" />
              <datalist id="cf-campaign-list">{campaigns.map((c) => <option key={c.campaign} value={c.campaign} />)}</datalist>
              <span id="cf-campaign-help" style={{ fontSize: 12, color: '#6b7280' }}>Sends and results apply to this campaign.</span>
            </div>
              <div style={{ borderTop: '1px solid #d6e6f0', marginTop: 16, paddingTop: 14 }}>
                <h5 style={{ fontSize: 13.5, fontWeight: 800, margin: '0 0 4px' }}>Reminder for people who haven&rsquo;t moved</h5>
                <p style={{ fontSize: 13, margin: '0 0 8px' }}>See who got the <strong>{campaign}</strong> email and still hasn&rsquo;t made progress, and read the reminder they would get. Looking does not send anything.</p>
                <button className="btn btn-outline" disabled={busy} onClick={previewNudge}>See who needs a reminder</button>
              {nudge && (
                <div style={{ marginTop: 12, fontSize: 13 }}>
                  <p style={{ margin: '0 0 8px' }}><strong>{nudge.counts.recipients} {nudge.counts.recipients === 1 ? 'person' : 'people'} would get a reminder.</strong> {nudge.counts.progress_moved} {nudge.counts.progress_moved === 1 ? 'has' : 'have'} moved since the email, so they are left out.</p>
                  <p style={{ margin: '0 0 8px' }}>Subject: <strong>{nudge.subject}</strong> · Reply to {nudge.sender.reply_to}</p>
                  {nudge.recipients.length > 0 && (
                    <div className="invite-table-wrap">
                      <table className="invite-table">
                        <thead><tr><th>Name</th><th>Department</th><th>Progress</th><th>Last active</th></tr></thead>
                        <tbody>{nudge.recipients.map((r) => <tr key={r.email}><td>{r.name}</td><td>{r.department ?? ''}</td><td>{r.pct}%</td><td>{when(r.last_active)}</td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                  {nudge.sample && <iframe title="Nudge sample" sandbox="" srcDoc={nudge.sample.html} style={{ width: '100%', height: 420, border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 12 }} />}
                </div>
              )}
            </div>
          </div>

          <div className="invite-form-card" style={{ marginTop: 18 }}>
            <h4>What recipients see</h4>
            {sender && (
              <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: '0 0 12px', fontSize: 13 }}>
                <dt style={{ fontWeight: 700 }}>From</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.from}</dd>
                <dt style={{ fontWeight: 700 }}>Reply to</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.reply_to} (replies go only here)</dd>
              </dl>
            )}
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>Check who gets it in the Roster below. Each person gets the version for their group. Use <strong>Preview</strong> on anyone to read their exact email, or send yourself a test of one version.</p>
            <div className="form-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <input type="email" className="form-input" style={{ maxWidth: 320 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Send the test to" />
              {FOLLOWUP_GROUPS.filter((g) => people.some((p) => p.group === g.key)).map((g) => (
                <button key={g.key} className="btn btn-outline" disabled={busy || !testTo.trim()} onClick={() => sendTest(g.key)}>Test: {g.label}</button>
              ))}
            </div>
            <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <button className="btn btn-primary" disabled={busy || !picked?.size} onClick={sendPicked}>
                Send to {picked?.size ?? 0} {picked?.size === 1 ? 'person' : 'people'} checked in the Roster below
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0' }}>
              Opened means the email&rsquo;s images loaded, so it undercounts people whose Outlook blocks images. Clicked means they followed the button. Progress since the email is the real measure.
            </p>
          </div>



          <h2 id="cert-roster-title" style={{ fontSize: 18, fontWeight: 900, color: '#0e4e73', margin: '28px 0 10px' }}>Roster</h2>
          <div className="cert-subtabs" role="tablist" aria-labelledby="cert-roster-title">
            {ROSTER.map((g) => (
              <button key={g.key} type="button" role="tab" className="cert-chip" aria-selected={rosterTab === g.key} onClick={() => setRosterTab(g.key)} title={g.who}>
                {g.label} · {count(g.key)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 10px' }}>
            <input type="search" className="form-input" style={{ width: '100%', maxWidth: 320 }} placeholder="Search name, email or department" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the roster" />
            <span style={{ fontSize: 12.5, color: '#6b7280' }}>{ROSTER.find((g) => g.key === rosterTab)?.who} · {rosterRows.length} shown · {picked?.size ?? 0} checked for the next send</span>
          </div>
          <div className="invite-table-wrap">
            <table className="invite-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={allOn} disabled={!rosterRows.length} onChange={(e) => toggleGroup(rosterRows, e.target.checked)} aria-label="Select everyone shown" /></th>
                  <th>Name</th><th>Progress</th><th>Last worked on it</th><th>Follow-up email</th><th aria-label="Preview"></th>
                </tr>
              </thead>
              <tbody>
                {rosterRows.length === 0 && <tr><td colSpan={6} style={{ opacity: 0.7 }}>Nobody in this group{q ? ' matches that search' : ''}.</td></tr>}
                {rosterRows.map((p) => {
                  const s = p.email_status
                  const moved = s && s.pct_at_send != null ? p.pct - s.pct_at_send : 0
                  return (
                    <tr key={p.email}>
                      <td><input type="checkbox" checked={!!picked?.has(p.email)} onChange={() => toggle(p.email)} aria-label={`Send to ${p.name}`} /></td>
                      <td><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 11, opacity: 0.7, overflowWrap: 'anywhere' }}>{p.department ?? ''}{p.department ? ' · ' : ''}{p.email}</div></td>
                      <td style={{ minWidth: 140 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }} role="img" aria-label={`${p.pct}% complete`}>
                            <div style={{ width: `${p.pct}%`, height: '100%', background: p.pct >= 90 ? '#16750C' : BLUE }} />
                          </div>
                          <strong style={{ fontSize: 13, minWidth: 36 }}>{p.pct}%</strong>
                        </div>
                        {moved > 0 && <div style={{ fontSize: 11, color: '#16750C', fontWeight: 700, marginTop: 3 }}>+{moved}% since the email</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{p.has_account ? when(p.last_active) : 'No account'}</td>
                      <td style={{ fontSize: 12 }}>
                        {p.failed ? <span className="badge badge-red" title={p.failed}>Failed</span>
                          : !s ? <span style={{ opacity: 0.7 }}>Not sent</span>
                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              <span className="badge badge-gray">Sent {stamp(s.sent_at)}</span>
                              {s.opened_at && <span className="badge badge-yellow">Opened {stamp(s.opened_at)}{s.open_count > 1 ? ` · ${s.open_count}x` : ''}</span>}
                              {s.clicked_at && <span className="badge badge-green">Clicked {stamp(s.clicked_at)}</span>}
                            </div>}
                      </td>
                      <td><button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy} onClick={() => openPreview(p.email)}>Preview</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && (
        <div role="dialog" aria-modal="true" aria-labelledby="cf-preview-title" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '32px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 10, width: 'min(720px, 100%)', padding: 20, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h3 id="cf-preview-title" style={{ margin: 0 }}>Preview</h3>
              <button className="btn btn-outline" onClick={() => setPreview(null)}>Close</button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', fontSize: 13, margin: '12px 0' }}>
              <dt style={{ fontWeight: 700 }}>To</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{preview.to}</dd>
              {sender && <><dt style={{ fontWeight: 700 }}>From</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.from}</dd><dt style={{ fontWeight: 700 }}>Reply to</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.reply_to}</dd></>}
              <dt style={{ fontWeight: 700 }}>Subject</dt><dd style={{ margin: 0 }}>{preview.subject}</dd>
            </dl>
            <iframe title={`Email to ${preview.to}`} srcDoc={preview.html} sandbox="" style={{ width: '100%', height: '65vh', border: '1px solid #ddd', borderRadius: 8, background: '#fff' }} />
          </div>
        </div>
      )}
    </div>
  )
}
