'use client'
// Email settings (Campaigns Phase 2, V 2026-10-28): how often each recurring
// email from BCPS MarComm comes, per person. Linked from the foot of every
// recurring email. Data: /api/bcps/email-settings.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Stream { key: string; name: string; description: string; frequency: string }

export default function EmailSettingsPage() {
  const [email, setEmail] = useState('')
  const [streams, setStreams] = useState<Stream[] | null>(null)
  const [freqs, setFreqs] = useState<{ key: string; label: string }[]>([])
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/bcps/email-settings', { headers: await auth(), cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not load your settings.'); return }
      setEmail(j.email); setStreams(j.streams); setFreqs(j.frequencies)
    })().catch(() => setErr('Could not load your settings.'))
  }, [])

  const change = async (key: string, frequency: string) => {
    setSaved(''); setErr('')
    const res = await fetch('/api/bcps/email-settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify({ stream: key, frequency }) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not save that.'); return }
    setStreams((streams ?? []).map((s) => (s.key === key ? { ...s, frequency } : s)))
    setSaved(`Saved: ${(streams ?? []).find((s) => s.key === key)?.name}, ${freqs.find((f) => f.key === frequency)?.label.toLowerCase()}.`)
  }

  return (
    <div className="es">
      <style>{CSS}</style>
      <div className="es-eyebrow">BCPS MarComm</div>
      <h1>Email settings</h1>
      <p className="es-lede">Choose how often each email from BCPS MarComm reaches you{email ? <> at <strong>{email}</strong></> : null}. Changes apply from the next send.</p>
      {err && <div className="es-error" role="alert">{err}</div>}
      {saved && <div className="es-saved" role="status">{saved}</div>}
      {!streams && !err && <p>Loading...</p>}
      {streams?.map((s) => (
        <div key={s.key} className="es-card">
          <div className="es-head">
            <h2>{s.name}</h2>
            <select aria-label={`How often: ${s.name}`} value={s.frequency} onChange={(e) => change(s.key, e.target.value)}>
              {freqs.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </div>
          <p>{s.description}</p>
        </div>
      ))}
    </div>
  )
}

const CSS = `
.es { max-width: 720px; margin: 0 auto; padding: 32px 20px 60px; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; }
.es-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #C55326; }
.es h1 { font-size: 26px; font-weight: 900; text-transform: uppercase; margin: 4px 0 8px; }
.es-lede { font-size: 14px; line-height: 1.6; color: rgba(26,26,26,0.75); margin: 0 0 20px; }
.es-card { border: 1px solid rgba(0,0,0,0.12); border-radius: 10px; padding: 16px 18px; margin-bottom: 12px; background: #fff; }
.es-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.es-head h2 { font-size: 16px; font-weight: 800; margin: 0; }
.es-card p { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.7); margin: 8px 0 0; }
.es select { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.2); border-radius: 6px; background: #fff; }
.es-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.es-saved { background: rgba(22,117,12,0.07); border-left: 4px solid #16750C; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
`
