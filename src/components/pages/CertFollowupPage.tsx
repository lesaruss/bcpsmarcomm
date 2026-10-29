'use client'

// Certification follow-up (Sean, 2026-10-29): every Department WCM who has not
// finished the certification, live, grouped the way the follow-up email is
// written (90% or more, 1% to 89%, not started, no account). Each row shows
// progress, the last time they worked on it, and what happened to the email:
// sent, opened, clicked, and how far they have moved since. Refreshes every 30
// seconds. Read the drafts with Preview, send yourself a test, then send to the
// people checked. /api/bcps/cert-followup does the work; SuperAdmin only.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { FOLLOWUP_GROUPS, type FollowupGroup } from '@/lib/bcps-cert-followup-groups'

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
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(ENDPOINT, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load the list.'); return }
    setErr('')
    setPeople(j.people)
    setSender(j.sender)
    setAsOf(j.as_of)
    // The first load checks everyone who has not been emailed yet.
    setPicked((cur) => cur ?? new Set((j.people as Person[]).filter((p) => !p.email_status).map((p) => p.email)))
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load])

  const post = async (payload: object) => {
    setBusy(true)
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(payload) })
      return { ok: r.ok, j: await r.json().catch(() => ({})) }
    } finally { setBusy(false) }
  }
  const openPreview = async (email: string) => {
    const { ok, j } = await post({ action: 'preview', email })
    if (ok) setPreview(j as Preview); else toast(j.error || 'Could not load the preview.')
  }
  const sendTest = async (group: FollowupGroup) => {
    const { ok, j } = await post({ action: 'test', to: testTo, group })
    toast(ok ? `Test sent to ${testTo}, written as it would read for ${j.as}.` : (j.error || 'Could not send the test.'))
  }
  const sendPicked = async () => {
    if (!picked?.size) return
    if (!window.confirm(`Send the follow-up to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}? Each gets the version for their group. Replies go to ${sender?.reply_to}.`)) return
    const { ok, j } = await post({ action: 'send', emails: Array.from(picked) })
    if (!ok) { toast(j.error || 'Could not send.'); return }
    toast(j.failed?.length ? `Sent ${j.sent}. ${j.failed.length} failed: ${j.failed.map((f: { email: string }) => f.email).join(', ')}` : `Sent ${j.sent} follow-up email${j.sent === 1 ? '' : 's'}.`)
    setPicked(new Set())
    load()
  }
  const toggle = (email: string) => setPicked((p) => { const n = new Set(p ?? []); if (n.has(email)) n.delete(email); else n.add(email); return n })
  const toggleGroup = (rows: Person[], on: boolean) => setPicked((p) => { const n = new Set(p ?? []); rows.forEach((r) => (on ? n.add(r.email) : n.delete(r.email))); return n })

  const stats = useMemo(() => {
    const list = people ?? []
    const sent = list.filter((p) => p.email_status)
    return {
      total: list.length,
      sent: sent.length,
      opened: sent.filter((p) => p.email_status!.opened_at).length,
      clicked: sent.filter((p) => p.email_status!.clicked_at).length,
      moved: sent.filter((p) => p.email_status!.pct_at_send != null && p.pct > (p.email_status!.pct_at_send as number)).length,
    }
  }, [people])

  if (err && !people) return <div style={{ padding: 32 }}>{err}</div>
  if (!people) return <div style={{ padding: 32 }}>Loading the certification follow-up...</div>

  const tile = (n: number | string, label: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', minWidth: 120, flex: '1 1 120px' }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: '#0e4e73' }}>{n}</div>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>{label}</div>
    </div>
  )

  return (
    <div style={{ padding: 32, maxWidth: 1200 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Certification Follow-up</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Every Department WCM who has not finished the certification, live. The District Web Team is left out.
        Updated {asOf ? when(asOf).toLowerCase() : ''}; refreshes every 30 seconds.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {tile(stats.total, 'Left to certify')}
        {FOLLOWUP_GROUPS.map((g) => tile(people.filter((p) => p.group === g.key).length, `${g.label} (${g.who})`))}
        {tile(stats.sent, 'Emailed')}
        {tile(stats.opened, 'Opened')}
        {tile(stats.clicked, 'Clicked the link')}
        {tile(stats.moved, 'Progressed since email')}
      </div>

      <div className="invite-form-card">
        <h4>What recipients see</h4>
        {sender && (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 16px', margin: '0 0 12px', fontSize: 13 }}>
            <dt style={{ fontWeight: 700 }}>From</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.from}</dd>
            <dt style={{ fontWeight: 700 }}>Reply to</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{sender.reply_to} (replies go only here)</dd>
          </dl>
        )}
        <p style={{ fontSize: 13, margin: '0 0 8px' }}>Each person gets the version for their group. Use <strong>Preview</strong> on anyone to read their exact email, or send yourself a test of one version.</p>
        <div className="form-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <input type="email" className="form-input" style={{ maxWidth: 320 }} value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Send the test to" />
          {FOLLOWUP_GROUPS.filter((g) => people.some((p) => p.group === g.key)).map((g) => (
            <button key={g.key} className="btn btn-outline" disabled={busy || !testTo.trim()} onClick={() => sendTest(g.key)}>Test: {g.label}</button>
          ))}
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={busy || !picked?.size} onClick={sendPicked}>
            Send to {picked?.size ?? 0} {picked?.size === 1 ? 'person' : 'people'} checked below
          </button>
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0' }}>
          Opened means the email&rsquo;s images loaded, so it undercounts people whose Outlook blocks images. Clicked means they followed the button. Progress since the email is the real measure.
        </p>
      </div>

      {FOLLOWUP_GROUPS.map((g) => {
        const rows = people.filter((p) => p.group === g.key)
        if (!rows.length) return null
        const allOn = rows.every((r) => picked?.has(r.email))
        return (
          <section key={g.key} style={{ marginTop: 22 }} aria-labelledby={`grp-${g.key}`}>
            <h2 id={`grp-${g.key}`} style={{ fontSize: 15, fontWeight: 800, color: '#0e4e73', margin: '0 0 8px' }}>{g.label} <span style={{ color: '#6b7280', fontWeight: 600 }}>· {g.who} · {rows.length}</span></h2>
            <div className="invite-table-wrap">
              <table className="invite-table">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allOn} onChange={(e) => toggleGroup(rows, e.target.checked)} aria-label={`Select everyone in ${g.label}`} /></th>
                    <th>Name</th><th>Progress</th><th>Last worked on it</th><th>Follow-up email</th><th aria-label="Preview"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
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
          </section>
        )
      })}

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
