'use client'

import { useState, useEffect } from 'react'
import { BETA_MEMBERS, DOMAIN_RULES } from '@/lib/data'
import type { BetaMember, DomainRule } from '@/lib/types'

interface SuperAdminPageProps {
  onShowToast: (msg: string) => void
}

type AdminTab = 'invites' | 'domain' | 'members' | 'platform'

const ADMIN_TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'invites', label: 'Beta Invitations', icon: '✉️' },
  { id: 'domain', label: 'Domain Rules', icon: '🔒' },
  { id: 'members', label: 'All Members', icon: '👥' },
  { id: 'platform', label: 'Platform Settings', icon: '⚙️' },
]

function statusBadge(status: BetaMember['status']) {
  const map: Record<BetaMember['status'], { label: string; cls: string }> = {
    sent: { label: 'Invited', cls: 'badge-yellow' },
    pending: { label: 'Pending', cls: 'badge-gray' },
    accepted: { label: 'Accepted', cls: 'badge-green' },
  }
  const { label, cls } = map[status]
  return <span className={`badge ${cls}`}>{label}</span>
}

function InvitesTab({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const [members, setMembers] = useState<BetaMember[]>(BETA_MEMBERS)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: '' })

  const refresh = async () => {
    try {
      const r = await fetch('/api/bcps/beta-invite')
      const j = await r.json()
      if (Array.isArray(j.members)) setMembers(j.members)
    } catch { /* keep current list */ }
  }
  useEffect(() => { refresh() }, [])

  const handleSend = async () => {
    if (!form.name || !form.email) {
      onShowToast('Please fill in name and email.')
      return
    }
    onShowToast('Sending invitation...')
    try {
      const r = await fetch('/api/bcps/beta-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', name: form.name, email: form.email, role: form.role }),
      })
      const j = await r.json()
      if (!r.ok) { onShowToast(j.error || 'Could not send invite.'); return }
      setForm({ name: '', email: '', role: '' })
      setShowForm(false)
      await refresh()
      onShowToast(`Beta invite sent to ${form.name}.`)
    } catch {
      onShowToast('Could not send invite. Please try again.')
    }
  }

  const handleResend = async (m: BetaMember) => {
    onShowToast(`Resending invite to ${m.name}...`)
    try {
      const r = await fetch('/api/bcps/beta-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', email: m.email }),
      })
      const j = await r.json()
      onShowToast(r.ok ? `Invite resent to ${m.name}.` : (j.error || 'Could not resend.'))
    } catch { onShowToast('Could not resend.') }
  }

  const handleRevoke = async (id: number) => {
    try {
      const r = await fetch('/api/bcps/beta-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke', id }),
      })
      const j = await r.json()
      if (!r.ok) { onShowToast(j.error || 'Could not revoke.'); return }
      await refresh()
      onShowToast('Invite revoked.')
    } catch { onShowToast('Could not revoke.') }
  }

  const handleExport = () => {
    const rows = ['Name,Email,Role,Status', ...members.map(m => `${m.name},${m.email},${m.role},${m.status}`)]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'bcps-beta-invites.csv'
    a.click()
    URL.revokeObjectURL(url)
    onShowToast('CSV exported!')
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h3>Beta Invitations</h3>
          <p>Invite team members to access the platform. Beta users get full access with no payment required.</p>
        </div>
        <div className="admin-header-actions">
          <button className="btn btn-outline" onClick={handleExport}>Export CSV</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Send Invite</button>
        </div>
      </div>

      {showForm && (
        <div className="invite-form-card">
          <h4>New Beta Invitation</h4>
          <div className="form-grid">
            <div className="form-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="e.g. Jane Smith"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="e.g. jsmith@browardschools.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-field">
              <label>Role / Title</label>
              <input
                type="text"
                placeholder="e.g. Communications Specialist"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="form-input"
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSend}>Send Invitation</button>
          </div>
        </div>
      )}

      <div className="invite-table-wrap">
        <table className="invite-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Beta</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id}>
                <td>
                  <div className="table-member">
                    <div className="avatar avatar-xs" style={{ background: '#1672A7' }}>
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    {m.name}
                  </div>
                </td>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>{statusBadge(m.status)}</td>
                <td><span className="badge badge-yellow">BETA</span></td>
                <td>
                  <div className="table-actions">
                    <button className="link-btn" onClick={() => handleResend(m)}>Resend</button>
                    <button className="link-btn danger" onClick={() => handleRevoke(m.id)}>Revoke</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DomainTab({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const [rules, setRules] = useState<DomainRule[]>(DOMAIN_RULES)
  const [newDomain, setNewDomain] = useState('')

  const toggle = (domain: string) => {
    setRules(prev => prev.map(r => r.domain === domain ? { ...r, enabled: !r.enabled } : r))
    onShowToast('Domain rule updated.')
  }

  const addDomain = () => {
    if (!newDomain.includes('.')) {
      onShowToast('Please enter a valid domain (e.g. school.edu)')
      return
    }
    if (rules.find(r => r.domain === newDomain)) {
      onShowToast('Domain already exists.')
      return
    }
    setRules(prev => [...prev, { domain: newDomain, enabled: true }])
    setNewDomain('')
    onShowToast(`Domain @${newDomain} added.`)
  }

  const removeDomain = (domain: string) => {
    setRules(prev => prev.filter(r => r.domain !== domain))
    onShowToast(`Domain @${domain} removed.`)
  }

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h3>Domain Access Rules</h3>
          <p>Only users with email addresses from allowed domains can register and access the platform.</p>
        </div>
      </div>

      <div className="domain-rules-list">
        {rules.map(rule => (
          <div key={rule.domain} className={`domain-rule-row${rule.enabled ? '' : ' disabled'}`}>
            <div className="domain-rule-info">
              <span className="domain-icon">🔒</span>
              <div>
                <strong>@{rule.domain}</strong>
                <span>{rule.enabled ? 'Access allowed' : 'Access blocked'}</span>
              </div>
            </div>
            <div className="domain-rule-actions">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={() => toggle(rule.domain)}
                />
                <span className="toggle-slider" />
              </label>
              <button className="icon-btn danger" onClick={() => removeDomain(rule.domain)} title="Remove">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="add-domain-row">
        <input
          type="text"
          placeholder="Add domain (e.g. school.edu)"
          value={newDomain}
          onChange={e => setNewDomain(e.target.value)}
          className="form-input"
          onKeyDown={e => e.key === 'Enter' && addDomain()}
        />
        <button className="btn btn-primary" onClick={addDomain}>+ Add Domain</button>
      </div>

      <div className="domain-notice">
        <span>ℹ️</span>
        <p>Currently allowed: {rules.filter(r => r.enabled).map(r => `@${r.domain}`).join(', ')}</p>
      </div>
    </div>
  )
}

function MembersTab({ onShowToast }: { onShowToast: (msg: string) => void }) {
  const allMembers = [
    { id: 1, name: 'Victoria', email: 'vegan@lesaruss.com', role: 'SuperAdmin', domain: 'lesaruss.com', joined: 'Jan 2026' },
    { id: 2, name: 'Felicia Hicks', email: 'fhicks@browardschools.com', role: 'Communications Lead', domain: 'browardschools.com', joined: 'Feb 2026' },
    { id: 3, name: 'Vanessa Deslandes', email: 'vdeslandes@browardschools.com', role: 'Digital Media Manager', domain: 'browardschools.com', joined: 'Feb 2026' },
    { id: 4, name: 'Tricia Allen', email: 'tallen@browardschools.com', role: 'Content Strategist', domain: 'browardschools.com', joined: 'Mar 2026' },
    { id: 5, name: 'Nakesha Ali-Sirju', email: 'nalisirju@browardschools.com', role: 'Communications Specialist', domain: 'browardschools.com', joined: 'Mar 2026' },
  ]

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h3>All Members</h3>
          <p>{allMembers.length} active members on the platform.</p>
        </div>
        <button className="btn btn-outline" onClick={() => onShowToast('Exporting member list…')}>Export</button>
      </div>
      <div className="invite-table-wrap">
        <table className="invite-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Domain</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allMembers.map(m => (
              <tr key={m.id}>
                <td>
                  <div className="table-member">
                    <div className="avatar avatar-xs" style={{ background: '#1672A7' }}>
                      {m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    {m.name}
                  </div>
                </td>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td><span className="badge badge-blue-light">@{m.domain}</span></td>
                <td>{m.joined}</td>
                <td>
                  <button className="link-btn" onClick={() => onShowToast(`Managing ${m.name}`)}>Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PlatformTab({ onShowToast }: { onShowToast: (msg: string) => void }) {
  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <div>
          <h3>Platform Settings</h3>
          <p>Global configuration for the Broward County Public Schools portal.</p>
        </div>
      </div>

      <div className="platform-settings">
        {[
          { label: 'BETA Mode', desc: 'Enable beta features for all users', checked: true },
          { label: 'Require Email Verification', desc: 'Users must verify email before accessing platform', checked: true },
          { label: 'Allow Self-Registration', desc: 'Users from allowed domains can self-register', checked: false },
          { label: 'Analytics Integration', desc: 'Enable Google Analytics integration for all users', checked: true },
          { label: 'Maintenance Mode', desc: 'Take the platform offline for maintenance', checked: false },
        ].map(s => (
          <div key={s.label} className="platform-setting-row">
            <div className="platform-setting-info">
              <strong>{s.label}</strong>
              <span>{s.desc}</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" defaultChecked={s.checked} onChange={() => onShowToast(`${s.label} updated`)} />
              <span className="toggle-slider" />
            </label>
          </div>
        ))}
      </div>

      <div className="platform-info-grid">
        <div className="platform-info-card">
          <div className="pi-label">Platform Version</div>
          <div className="pi-value">1.0.0-beta</div>
        </div>
        <div className="platform-info-card">
          <div className="pi-label">District</div>
          <div className="pi-value">Broward County Public Schools</div>
        </div>
        <div className="platform-info-card">
          <div className="pi-label">Environment</div>
          <div className="pi-value">Development</div>
        </div>
        <div className="platform-info-card">
          <div className="pi-label">Active Members</div>
          <div className="pi-value">5</div>
        </div>
      </div>
    </div>
  )
}

export default function SuperAdminPage({ onShowToast }: SuperAdminPageProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('invites')

  return (
    <div className="superadmin-page">
      <div className="superadmin-hero">
        <span className="superadmin-badge">🛡️ SuperAdmin</span>
        <h2>Platform Management</h2>
        <p>Manage access, invitations, domain rules, and platform settings for Broward County Public Schools.</p>
      </div>

      <div className="admin-tabs">
        {ADMIN_TABS.map(tab => (
          <button
            key={tab.id}
            className={`admin-tab-btn${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'invites' && <InvitesTab onShowToast={onShowToast} />}
        {activeTab === 'domain' && <DomainTab onShowToast={onShowToast} />}
        {activeTab === 'members' && <MembersTab onShowToast={onShowToast} />}
        {activeTab === 'platform' && <PlatformTab onShowToast={onShowToast} />}
      </div>
    </div>
  )
}
