'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Recurring emails on the Campaigns tab (Campaigns Phase 2, V 2026-10-28).
// Each recurring email shows who gets it, with each person's chosen
// frequency; Preview opens anyone's exact email, Test sends one to you, and
// Approve covers a week (Monday to Friday). Nothing sends for a week until it
// is approved; the Friday email asks for approval by 5 PM. Data:
// /api/bcps/email-streams.

const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Week { week_start: string; approved: boolean; approved_by: string | null; approved_at: string | null; sent: number; failed: number }
interface Stream {
  key: string; name: string; description: string; ready: boolean; default_frequency: string
  people: { email: string; name: string; subject: string; frequency: string }[]
  weeks: Week[]
}
const FREQ: Record<string, string> = { daily: 'Every weekday', weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly', off: 'Off' }
const fmt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })

export default function RecurringEmails({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const [data, setData] = useState<{ today: string; weeks: string[]; streams: Stream[] } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ subject: string; html: string; name: string } | null>(null)

  const load = async () => {
    setErr('')
    const res = await fetch('/api/bcps/email-streams', { headers: await auth(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not load the recurring emails.'); return }
    setData(j)
  }
  useEffect(() => { load().catch(() => setErr('Could not load the recurring emails.')) }, [])

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/bcps/email-streams', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({ error: 'The server did not answer.' }))
    if (!res.ok) throw new Error(j.error || 'Something went wrong.')
    return j
  }
  const approve = async (s: Stream, week: string, on: boolean) => {
    setBusy(`${s.key}:${week}`)
    try { await post({ action: on ? 'approve' : 'withdraw', stream: s.key, week_start: week }); onShowToast(on ? `${s.name} approved for the week of ${fmt(week)}.` : `Approval withdrawn: ${s.name}, week of ${fmt(week)}.`); await load() }
    catch (e) { onShowToast((e as Error).message) } finally { setBusy('') }
  }
  const test = async (s: Stream, email: string) => {
    setBusy(`test:${s.key}`)
    try { const j = await post({ action: 'test', stream: s.key, email }); onShowToast(`Test sent to ${j.to}.`) }
    catch (e) { onShowToast((e as Error).message) } finally { setBusy('') }
  }
  const show = async (s: Stream, email: string) => {
    const res = await fetch(`/api/bcps/email-streams?preview=${encodeURIComponent(s.key)}&email=${encodeURIComponent(email)}`, { headers: await auth(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { onShowToast(j.error || 'Could not open that email.'); return }
    setPreview({ subject: j.subject, html: j.html, name: j.name || j.email })
  }

  return (
    <div className="invite-form-card" style={{ marginTop: 24 }}>
      <h3 style={{ marginTop: 0 }}>Recurring emails</h3>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted, #555)', margin: '0 0 12px' }}>
        These go out on a schedule to the right people, built from live data on the morning they send. Each needs your approval for the week, by Friday 5 PM for the week after; nothing sends for a week that is not approved. Everyone can change how often they get each one from the link at the foot of the email.
      </p>
      {err && <p role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}
      {!data && !err && <p style={{ fontSize: 13 }}>Loading...</p>}
      {data?.streams.map((s) => (
        <div key={s.key} style={{ borderTop: '1px solid var(--border, #e5e7eb)', padding: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong style={{ fontSize: 15 }}>{s.name}</strong>
            <span style={{ fontSize: 12, color: 'var(--text-muted, #666)' }}>{s.ready ? `${s.people.length} ${s.people.length === 1 ? 'person' : 'people'} today · default ${FREQ[s.default_frequency].toLowerCase()}` : 'Coming next'}</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.55, margin: '6px 0 10px', color: 'var(--text-muted, #555)' }}>{s.description}</p>
          {s.ready && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                {s.weeks.map((w, i) => (
                  <div key={w.week_start} style={{ border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 220 }}>
                    <div style={{ fontWeight: 800 }}>{i === 0 ? 'This week' : 'Next week'}: {fmt(w.week_start)}</div>
                    <div style={{ margin: '4px 0 6px', color: w.approved ? '#16750C' : '#8a4b00' }}>
                      {w.approved ? `Approved by ${w.approved_by}` : 'Not approved, so nothing sends'}{w.sent || w.failed ? ` · ${w.sent} sent${w.failed ? `, ${w.failed} failed` : ''}` : ''}
                    </div>
                    <button type="button" className={w.approved ? 'wcm-hub2-card-btn' : 'home-btn'} disabled={!!busy || !s.people.length && !w.approved} onClick={() => approve(s, w.week_start, !w.approved)}>
                      {busy === `${s.key}:${w.week_start}` ? 'Saving...' : w.approved ? 'Withdraw approval' : 'Approve this week'}
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="wcm-hub2-card-btn" onClick={() => setOpen(open === s.key ? null : s.key)}>{open === s.key ? 'Hide who gets it' : 'Who gets it'}</button>
              {open === s.key && (
                <table style={{ width: '100%', fontSize: 12, marginTop: 10, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ textAlign: 'left' }}><th>Person</th><th>Subject</th><th>How often</th><th /></tr></thead>
                  <tbody>
                    {s.people.map((p) => (
                      <tr key={p.email} style={{ borderTop: '1px solid var(--border, #eee)' }}>
                        <td style={{ padding: '6px 6px 6px 0' }}>{p.name || p.email}<br /><span style={{ color: '#888' }}>{p.email}</span></td>
                        <td style={{ padding: 6 }}>{p.subject}</td>
                        <td style={{ padding: 6 }}>{FREQ[p.frequency] ?? p.frequency}</td>
                        <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                          <button type="button" className="wcm-hub2-card-btn" onClick={() => show(s, p.email)}>Preview</button>{' '}
                          <button type="button" className="wcm-hub2-card-btn" disabled={!!busy} onClick={() => test(s, p.email)}>Test to me</button>
                        </td>
                      </tr>
                    ))}
                    {!s.people.length && <tr><td colSpan={4} style={{ padding: 6 }}>Nobody would get this email today.</td></tr>}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      ))}
      {preview && (
        <div role="dialog" aria-modal="true" aria-label={`Email to ${preview.name}`} onClick={(e) => { if (e.target === e.currentTarget) setPreview(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 10, width: 'min(720px, 100%)', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div><div style={{ fontSize: 11, color: '#666' }}>To {preview.name}</div><strong>{preview.subject}</strong></div>
              <button type="button" className="wcm-hub2-card-btn" onClick={() => setPreview(null)}>Close</button>
            </div>
            <iframe title="Email preview" srcDoc={preview.html} style={{ width: '100%', height: 640, border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 12 }} />
          </div>
        </div>
      )}
    </div>
  )
}
