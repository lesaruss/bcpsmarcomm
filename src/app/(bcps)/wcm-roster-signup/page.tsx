'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

interface DeptOption {
  id: string
  department_name: string
  location_number: string
}

interface CurrentWcm {
  id: string
  wcm_name: string
  wcm_email: string | null
  wcm_personnel_number: string | null
}

interface NewWcmRow {
  key: number
  name: string
  email: string
  personnelNumber: string
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

let rowKeySeq = 0

export default function WCMRosterSignupPage() {
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [deptQuery, setDeptQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState<DeptOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [manualDept, setManualDept] = useState(false)

  const [directorName, setDirectorName] = useState('')
  const [directorTouched, setDirectorTouched] = useState(false)
  // What was actually on file when the department was picked (not what the
  // director may have retyped) - used to detect a possible identity mismatch.
  const [originalDirectorName, setOriginalDirectorName] = useState('')

  const [submitterEmail, setSubmitterEmail] = useState('')
  const [notDirector, setNotDirector] = useState(false)
  const [submitterName, setSubmitterName] = useState('')
  const [submitterRole, setSubmitterRole] = useState('')

  // "On file" WCMs for the selected department, and which of them the
  // director has flagged for removal (pending review, not deleted yet).
  const [currentWcms, setCurrentWcms] = useState<CurrentWcm[] | null>(null)
  const [currentLoading, setCurrentLoading] = useState(false)
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set())

  const [newRows, setNewRows] = useState<NewWcmRow[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // Full "what's next" panel replaces the form after a successful submit,
  // per Sean 2026-09-12: a director who just submitted should see what
  // happens next, not just a one-line confirmation. Account creation and
  // the notification emails (to the director AND the WCM they designated)
  // happen when the District Web Team approves the submission, not here on
  // raw submission - so this panel sets expectations rather than promising
  // something that hasn't happened yet.
  const [submittedCount, setSubmittedCount] = useState(0)

  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/bcps/wcm-roster-departments')
      .then(r => r.json())
      .then(j => setDepartments(j.departments || []))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Pull "who's on file" the moment a real (matched) department is picked.
  // This is the prefill Sean asked for: pick a department, see the current
  // WCM(s) pop up so the director can confirm, remove, or add rather than
  // re-typing everything from a blank form.
  useEffect(() => {
    setNotDirector(false)
    setSubmitterName('')
    setSubmitterRole('')
    if (!selectedDept) {
      setCurrentWcms(null)
      setRemoveIds(new Set())
      setOriginalDirectorName('')
      return
    }
    setCurrentLoading(true)
    setRemoveIds(new Set())
    fetch(`/api/bcps/wcm-roster-current?roster_id=${selectedDept.id}`)
      .then(r => r.json())
      .then(j => {
        setCurrentWcms(j.wcms || [])
        setOriginalDirectorName(j.director_name || '')
        if (!directorTouched && j.director_name) setDirectorName(j.director_name)
      })
      .catch(() => setCurrentWcms([]))
      .finally(() => setCurrentLoading(false))
  }, [selectedDept]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDepts = useMemo(() => {
    const q = deptQuery.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(d => d.department_name.toLowerCase().includes(q))
  }, [departments, deptQuery])

  function pickDept(d: DeptOption) {
    setSelectedDept(d)
    setDeptQuery(`${titleCase(d.department_name)} (${d.location_number})`)
    setShowDropdown(false)
    setResult(null)
  }

  function useManualDept() {
    setSelectedDept(null)
    setCurrentWcms(null)
    setManualDept(true)
    setShowDropdown(false)
  }

  function backToDeptSearch() {
    setManualDept(false)
    setDeptQuery('')
    setSelectedDept(null)
    setCurrentWcms(null)
  }

  function toggleRemove(id: string) {
    setRemoveIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function addRow() {
    setNewRows(prev => [...prev, { key: ++rowKeySeq, name: '', email: '', personnelNumber: '' }])
  }

  function updateRow(key: number, field: keyof Omit<NewWcmRow, 'key'>, value: string) {
    setNewRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)))
  }

  function removeRow(key: number) {
    setNewRows(prev => prev.filter(r => r.key !== key))
  }

  async function postChange(payload: Record<string, unknown>) {
    const r = await fetch('/api/bcps/wcm-roster-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_key: ACCESS_KEY, ...payload }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Submission failed.')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const departmentName = manualDept ? deptQuery.trim() : selectedDept?.department_name
    if (!departmentName) {
      setResult({
        type: 'error',
        text: manualDept ? 'Please enter your department name.' : 'Please select your department from the list.',
      })
      return
    }
    if (!directorName.trim()) {
      setResult({ type: 'error', text: 'Director name is required.' })
      return
    }
    if (!submitterEmail.trim()) {
      setResult({ type: 'error', text: 'Your email address is required.' })
      return
    }
    if (notDirector && (!submitterName.trim() || !submitterRole.trim())) {
      setResult({ type: 'error', text: 'Please enter your name and role so the District Web Team knows who completed this.' })
      return
    }

    const removals = currentWcms?.filter(w => removeIds.has(w.id)) ?? []
    const additions = newRows.filter(r => r.name.trim())
    const incompleteRow = newRows.find(r => !r.name.trim() && (r.email.trim() || r.personnelNumber.trim()))

    if (incompleteRow) {
      setResult({ type: 'error', text: 'Each new WCM you add needs at least a name.' })
      return
    }
    if (removals.length === 0 && additions.length === 0) {
      setResult({ type: 'error', text: 'Remove someone or add someone before submitting. Every department needs a Web Content Manager on file.' })
      return
    }

    setSubmitting(true)
    setResult(null)
    try {
      const common = {
        department_name: departmentName,
        director_name: directorName.trim(),
        roster_id: selectedDept?.id,
        submitter_email: submitterEmail.trim(),
        identity_flag: notDirector,
        submitter_name: notDirector ? submitterName.trim() : undefined,
        submitter_role: notDirector ? submitterRole.trim() : undefined,
      }

      for (const w of removals) {
        await postChange({ ...common, action: 'remove', target_member_id: w.id, wcm_name: w.wcm_name })
      }
      for (const row of additions) {
        await postChange({
          ...common,
          action: 'add',
          wcm_name: row.name.trim(),
          wcm_email: row.email.trim() || undefined,
          wcm_personnel_number: row.personnelNumber.trim() || undefined,
        })
      }

      const count = removals.length + additions.length
      setSubmittedCount(count)
      setResult({ type: 'success', text: '' })
      setNewRows([])
      setRemoveIds(new Set())
      // Re-pull current WCMs so the pending-removal strike-through clears
      // now that the removal has actually been recorded.
      if (selectedDept) {
        fetch(`/api/bcps/wcm-roster-current?roster_id=${selectedDept.id}`)
          .then(r => r.json()).then(j => setCurrentWcms(j.wcms || [])).catch(() => {})
      }
    } catch (err) {
      setResult({ type: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 28px', borderBottom: '3px solid var(--blue)',
        background: '#fff',
      }}>
        <img
          src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
          alt="Broward County Public Schools"
          style={{ height: 40, width: 'auto', flexShrink: 0 }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Broward County Public Schools</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>District Web Team</div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--blue)', marginBottom: 8 }}>
            Department Web Managers
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Department Web Content Managers Roster 2026/27
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            This form confirms who is approved to make updates for your department, so it needs to be completed
            by you, the director, not by someone filling it out on your behalf. Pick your department below to
            see who&apos;s currently on file, then confirm, remove, or add Web Content Managers (WCMs) as needed.
            Every change is reviewed by the District Web Team before it&apos;s locked in, so if something here is
            wrong or out of date, just fix it.
          </p>
        </div>

        {result?.type === 'error' && (
          <div
            style={{
              padding: '14px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14, fontWeight: 600,
              background: '#FEF2F2', color: '#DC2626', border: '1px solid rgba(220,38,38,0.25)',
            }}
          >
            {result.text}
          </div>
        )}

        {result?.type === 'success' && (
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#ECFDF5', borderBottom: '1px solid rgba(5,150,105,0.25)', padding: '18px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#059669', marginBottom: 4 }}>
                Submitted
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Thank you. {submittedCount} update{submittedCount === 1 ? '' : 's'} submitted for the 2026/27 school year.
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--blue)', marginBottom: 12 }}>
                What happens next
              </div>
              <ol style={{ margin: 0, padding: '0 0 0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  The District Web Team reviews your submission. Nothing changes on the live roster until it&apos;s approved.
                </li>
                <li style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Once approved, you&apos;ll get an email confirming you&apos;re set for 2026/27, with a one-click link to log in or finish setting up your BCPS Web Team Portal account. From there you can see your department&apos;s page and the full Departments directory.
                </li>
                <li style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Your designated Web Content Manager gets their own confirmation email at the same time, with the same kind of one-click link, so nothing depends on you passing along a password or a set of instructions.
                </li>
                <li style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Watch for <strong>Communique</strong>, our monthly newsletter, for anything new between now and then.
                </li>
                <li style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Need to add or remove a Web Content Manager later, or something changes? Come back to this same form any time, no need to start over.
                </li>
              </ol>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 22, fontSize: 12.5, padding: '8px 16px' }}
                onClick={() => { setResult(null); backToDeptSearch() }}
              >
                Submit another update
              </button>
            </div>
          </div>
        )}

        {result?.type !== 'success' && (
        <div className="wcm-portal-content">
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Department <span style={{ color: '#DC2626' }}>*</span>
              </label>
              {manualDept ? (
                <div>
                  <input
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Type your department name"
                    value={deptQuery}
                    onChange={e => setDeptQuery(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={backToDeptSearch}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, padding: '6px 0 0', display: 'block' }}
                  >
                    Search departments instead
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }} ref={boxRef}>
                  <input
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Start typing to search departments..."
                    value={deptQuery}
                    onChange={e => { setDeptQuery(e.target.value); setSelectedDept(null); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    autoComplete="off"
                    required
                  />
                  {showDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 260, overflowY: 'auto',
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20,
                    }}>
                      {filteredDepts.length === 0 && (
                        <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No departments match.</div>
                      )}
                      {filteredDepts.map(d => (
                        <div
                          key={d.id}
                          onClick={() => pickDept(d)}
                          style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          onMouseDown={ev => ev.preventDefault()}
                        >
                          {titleCase(d.department_name)} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({d.location_number})</span>
                        </div>
                      ))}
                      <div
                        onClick={useManualDept}
                        onMouseDown={ev => ev.preventDefault()}
                        style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--blue)', cursor: 'pointer' }}
                      >
                        Don&apos;t see your department? Enter it manually
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Director&apos;s Name <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                value={directorName}
                onChange={e => { setDirectorName(e.target.value); setDirectorTouched(true) }}
                placeholder="Enter your answer"
                required
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Your Email <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                className="form-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
                type="email"
                value={submitterEmail}
                onChange={e => setSubmitterEmail(e.target.value)}
                placeholder="you@browardschools.com"
                required
              />
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                So the District Web Team can reach you about this submission if needed.
              </p>
            </div>

            {selectedDept && (
              <div style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>
                  Currently On File
                </label>
                {currentLoading && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking...</div>
                )}
                {!currentLoading && currentWcms && currentWcms.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 0' }}>
                    No WCM on file yet for this department. Add one below.
                  </div>
                )}
                {!currentLoading && currentWcms && currentWcms.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {currentWcms.map(w => {
                      const flagged = removeIds.has(w.id)
                      const isTbd = w.wcm_name.trim().toUpperCase() === 'TBD'
                      return (
                        <div
                          key={w.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                            padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)',
                            background: flagged ? '#FEF2F2' : (isTbd ? '#FFFBEB' : '#fafbfc'),
                          }}
                        >
                          <div style={{ textDecoration: flagged ? 'line-through' : 'none', opacity: flagged ? 0.6 : 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {isTbd ? 'TBD (needs a replacement)' : w.wcm_name}
                            </div>
                            {(w.wcm_email || w.wcm_personnel_number) && !isTbd && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {[w.wcm_email, w.wcm_personnel_number].filter(Boolean).join(' | ')}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleRemove(w.id)}
                            style={{
                              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                              padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              color: flagged ? 'var(--text-muted)' : '#DC2626', flexShrink: 0,
                            }}
                          >
                            {flagged ? 'Undo' : (isTbd ? 'Clear' : 'Remove')}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>
                  Still correct? Leave as-is, nothing to do. Wrong or someone&apos;s gone? Mark it for removal and add their replacement below.
                </p>
              </div>
            )}

            <div style={{ marginBottom: 24 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>
                Add a Web Content Manager
              </label>
              {newRows.map((row, i) => (
                <div key={row.key} className="wcm-new-row">
                  <div className="wcm-new-row-fields">
                    <input
                      className="form-input"
                      placeholder="Name"
                      value={row.name}
                      onChange={e => updateRow(row.key, 'name', e.target.value)}
                      autoFocus={i === newRows.length - 1}
                    />
                    <input
                      className="form-input"
                      placeholder="Email"
                      type="email"
                      value={row.email}
                      onChange={e => updateRow(row.key, 'email', e.target.value)}
                    />
                    <input
                      className="form-input"
                      placeholder="Personnel #"
                      value={row.personnelNumber}
                      onChange={e => updateRow(row.key, 'personnelNumber', e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    aria-label="Remove this row"
                    className="wcm-new-row-remove"
                  >
                    &#215;
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="btn-secondary"
                style={{ marginTop: 4, fontSize: 12.5, padding: '7px 14px' }}
              >
                + Add a WCM
              </button>
            </div>

            <button type="submit" className="btn-primary" disabled={submitting} style={{ padding: '11px 28px', fontSize: 14 }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>
        </div>
        )}
      </main>
    </div>
  )
}
