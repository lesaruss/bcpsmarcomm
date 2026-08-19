'use client'

// SuperAdmin-only tool for onboarding individual school ADA scan accounts.
// Per V, 2026-08-19: schools don't get the full BCPS Marcomm dashboard -
// each one gets a real login (created here) that only ever opens
// /school-portal, a standalone page showing just their school's info and
// ADA scan results. Starts empty; schools are added one at a time as
// they're onboarded (no existing consolidated roster to import).

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface School {
  id: string
  name: string
  site_url: string | null
  wcm_name: string | null
  wcm_email: string | null
  wcm_user_id: string | null
  notes: string | null
  created_at: string
}

const BLUE = '#1672A7'

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  input: { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 4 } as React.CSSProperties,
  btnPrimary: { padding: '10px 18px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function SchoolsAdminPage() {
  const supabase = createClient()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', site_url: '', wcm_name: '', wcm_email: '', temp_password: '', notes: '' })

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true)
    const t = await token()
    const r = await fetch('/api/bcps/schools', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (r.ok) setSchools(j.schools)
    else setError(j.error || 'Failed to load schools.')
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const addSchool = async () => {
    if (!form.name.trim()) { setError('School name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const t = await token()
      const r = await fetch('/api/bcps/schools', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Could not add school.'); return }
      setForm({ name: '', site_url: '', wcm_name: '', wcm_email: '', temp_password: '', notes: '' })
      setShowForm(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={C.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={C.sublabel}>School ADA Scan Accounts</div>
            <p style={{ fontSize: 13, color: '#4b5563', margin: 0 }}>
              Each school here gets a real login that only ever opens the standalone school portal
              (<code>/school-portal</code>) - their own basic info plus a Run ADA Scan button and their
              own results. No dashboard access, no district ACL grants.
            </p>
          </div>
          <button style={{ ...C.btnPrimary, whiteSpace: 'nowrap' }} onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Add School'}
          </button>
        </div>

        {showForm && (
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>School Name *</span>
                <input style={C.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Coral Springs High School" />
              </label>
              <label>
                <span style={C.label}>Website URL</span>
                <input style={C.input} value={form.site_url} onChange={e => setForm(f => ({ ...f, site_url: e.target.value }))} placeholder="https://www.browardschools.com/coralspringshigh" />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>WCM Name</span>
                <input style={C.input} value={form.wcm_name} onChange={e => setForm(f => ({ ...f, wcm_name: e.target.value }))} placeholder="Jane Doe" />
              </label>
              <label>
                <span style={C.label}>WCM Email</span>
                <input style={C.input} value={form.wcm_email} onChange={e => setForm(f => ({ ...f, wcm_email: e.target.value }))} placeholder="jane.doe@browardschools.com" />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>Temporary Password</span>
                <input style={C.input} value={form.temp_password} onChange={e => setForm(f => ({ ...f, temp_password: e.target.value }))} placeholder="Leave blank to add school without creating a login yet" />
              </label>
              <label>
                <span style={C.label}>Notes</span>
                <input style={C.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </label>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              If a WCM email + temporary password are both filled in, a real login is created immediately
              (the WCM is forced to set their own password on first sign-in, same as any other account here).
              Leave the password blank to add the school now and create the login later.
            </p>
            {error && <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{error}</div>}
            <div>
              <button style={{ ...C.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addSchool} disabled={saving}>
                {saving ? 'Saving…' : 'Save School'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={C.card}>
        <div style={C.sublabel}>Schools ({schools.length})</div>
        {loading ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>
        ) : schools.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>No schools added yet. Use &ldquo;+ Add School&rdquo; above to onboard the first one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {schools.map(s => (
              <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {s.wcm_name || 'No WCM name'} {s.wcm_email ? `· ${s.wcm_email}` : ''}
                  </div>
                  {s.site_url && <div style={{ fontSize: 11, color: '#9ca3af', wordBreak: 'break-all' }}>{s.site_url}</div>}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  background: s.wcm_user_id ? '#e6f6ea' : '#fff4e0',
                  color: s.wcm_user_id ? '#1a7f37' : '#9a6700',
                }}>
                  {s.wcm_user_id ? 'Login active' : 'No login yet'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
