'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Project leads (BCPS Document System, Phase 3, V 2026-10-28). A toolbar
// button on a Playbook for its leads and the superadmin. The superadmin picks
// the leads (who upload transcripts, build agendas and review team input) and
// the backup lead; a lead picks the backup. Anything waiting on the leads for
// five business days goes to the backup too. Data: /api/bcps/playbook-leads.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Person { name: string; email: string }

export default function ProjectLeads({ playbook, onSaved }: { playbook: string; onSaved: (message: string) => void }) {
  const [allowed, setAllowed] = useState(false)
  const [canSetLeads, setCanSetLeads] = useState(false)
  const [people, setPeople] = useState<Person[]>([])
  const [leads, setLeads] = useState<string[]>([])
  const [backups, setBackups] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const res = await fetch(`/api/bcps/playbook-leads?slug=${encodeURIComponent(playbook)}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    setAllowed(!!j.allowed)
    if (j.allowed) { setCanSetLeads(!!j.can_set_leads); setPeople(j.people ?? []); setLeads(j.leads ?? []); setBackups(j.backups ?? []) }
  }
  useEffect(() => {
    load().catch(() => {})
    const { data } = supabaseClient.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load().catch(() => {}) })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbook])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!allowed) return null

  const name = (e: string) => people.find((p) => p.email === e)?.name || e
  const toggle = (list: string[], set: (v: string[]) => void, e: string) => set(list.includes(e) ? list.filter((x) => x !== e) : [...list, e])
  const save = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/bcps/playbook-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ slug: playbook, ...(canSetLeads ? { leads } : {}), backups }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      setOpen(false)
      onSaved(`Saved. Leads: ${leads.map(name).join(', ') || 'none'}. Backup: ${backups.map(name).join(', ') || 'none'}.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" className="wcm-hub2-card-btn" onClick={() => { setError(''); setOpen(true); load().catch(() => {}) }}>Project leads</button>
      {open && (
        <div className="pl-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
          <div className="pl-panel" role="dialog" aria-modal="true" aria-labelledby="pl-title">
            <div className="pl-head">
              <h2 id="pl-title">Project leads</h2>
              <button type="button" className="pl-x" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>&times;</button>
            </div>
            <p className="pl-help">Leads upload meeting transcripts, build the agenda, add deliverables and review team input. The backup lead steps in when something has waited on the leads for five business days. Pick from the people who can open this Playbook.</p>
            {error && <div className="pl-error" role="alert">{error}</div>}
            <fieldset className="pl-set">
              <legend>Leads{!canSetLeads && <span> (set by the superadmin)</span>}</legend>
              {canSetLeads ? people.map((p) => (
                <label key={p.email} className="pl-opt"><input type="checkbox" checked={leads.includes(p.email)} disabled={backups.includes(p.email)} onChange={() => toggle(leads, setLeads, p.email)} /> {p.name}</label>
              )) : <p className="pl-now">{leads.map(name).join(', ') || 'None named yet'}</p>}
            </fieldset>
            <fieldset className="pl-set">
              <legend>Backup lead</legend>
              {people.filter((p) => !leads.includes(p.email)).map((p) => (
                <label key={p.email} className="pl-opt"><input type="checkbox" checked={backups.includes(p.email)} onChange={() => toggle(backups, setBackups, p.email)} /> {p.name}</label>
              ))}
            </fieldset>
            <div className="pl-actions">
              <button type="button" className="pl-btn ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="pl-btn" disabled={busy || (canSetLeads && !leads.length)} onClick={save}>{busy ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const CSS = `
.pl-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.pl-panel { background: #fff; border-radius: 10px; width: min(560px, 100%); padding: 24px 28px; font-family: 'Open Sans', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.pl-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.pl-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.pl-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.pl-help { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.75); margin: 0 0 14px; }
.pl-set { border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; padding: 10px 14px 12px; margin: 0 0 12px; max-height: 260px; overflow-y: auto; }
.pl-set legend { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.55); padding: 0 4px; }
.pl-set legend span { text-transform: none; letter-spacing: 0; font-weight: 600; }
.pl-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
.pl-now { font-size: 13px; margin: 4px 0 0; }
.pl-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.pl-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.pl-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.pl-btn.ghost { background: #fff; color: #0e4e73; }
.pl-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) { .pl-panel { padding: 18px 16px; } }
`
