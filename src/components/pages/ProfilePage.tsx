'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { PageId } from '@/lib/types'

interface ProfilePageProps {
  subPage?: string
  onNavigate: (page: PageId) => void
}

type TabId = 'missioncontrol' | 'consoles' | 'articles' | 'messages'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'missioncontrol', label: 'Mission Control', icon: '⚡' },
  { id: 'consoles', label: 'Consoles & Cartridges', icon: '🎮' },
  { id: 'articles', label: 'Articles', icon: '📰' },
  { id: 'messages', label: 'Messages', icon: '💬' },
]

const ARTICLES = [
  { id: 1, title: 'Effective Communication Strategies for K-12 Districts', date: 'April 10, 2026', reads: 142, tags: ['#communications', '#strategy'] },
  { id: 2, title: 'Building Community Engagement Through Social Media', date: 'March 28, 2026', reads: 89, tags: ['#social', '#engagement'] },
  { id: 3, title: 'Digital Transformation in Public Schools', date: 'March 15, 2026', reads: 201, tags: ['#digital', '#education'] },
]

const MESSAGES = [
  { id: 1, from: 'Felicia Hicks', initials: 'FH', color: '#1672A7', preview: 'Can you review the Q2 strategy doc before Thursday?', time: '10:32 AM', unread: true },
  { id: 2, from: 'Tricia Allen', initials: 'TA', color: '#2E8B57', preview: 'The website redesign files are ready for review.', time: 'Yesterday', unread: false },
  { id: 3, from: 'Vanessa Deslandes', initials: 'VD', color: '#7B5EA7', preview: 'Board meeting notes uploaded to the library.', time: 'Apr 12', unread: false },
]

interface UserProfile {
  userId: string
  email: string
  full_name: string | null
  department: string | null
  is_admin: boolean
}

function MissionControlTab({ profile, onProfileUpdate }: { profile: UserProfile | null; onProfileUpdate: (p: UserProfile | null) => void }) {
  const [displayName, setDisplayName] = useState(profile?.full_name || '')
  const [email, setEmail] = useState(profile?.email || '')
  const [department, setDepartment] = useState(profile?.department || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.full_name || '')
      setEmail(profile.email || '')
      setDepartment(profile.department || '')
    }
  }, [profile])

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setSaved(false)
    const res = await fetch('/api/cert/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: profile.userId, full_name: displayName.trim() || null, department: department.trim() || null }),
    })
    setSaving(false)
    if (res.ok) {
      setSaved(true)
      onProfileUpdate({ ...profile, full_name: displayName.trim() || null, department: department.trim() || null })
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <div className="profile-tab-content">
      <div className="profile-widgets-grid">
        <div className="profile-widget">
          <div className="widget-header">
            <h4>My Recent Activity</h4>
          </div>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-icon">📝</span>
              <div><strong>Posted a note</strong><span>Q2 Communications Strategy</span></div>
              <span className="activity-time">2h ago</span>
            </div>
            <div className="activity-item">
              <span className="activity-icon">🏢</span>
              <div><strong>Updated department</strong><span>Office of Communications</span></div>
              <span className="activity-time">1d ago</span>
            </div>
            <div className="activity-item">
              <span className="activity-icon">📊</span>
              <div><strong>Ran analytics report</strong><span>April Performance Overview</span></div>
              <span className="activity-time">2d ago</span>
            </div>
          </div>
        </div>

        <div className="profile-widget">
          <div className="widget-header"><h4>My Stats</h4></div>
          <div className="profile-stats">
            <div className="profile-stat"><span className="profile-stat-value">38</span><span className="profile-stat-label">Notes Posted</span></div>
            <div className="profile-stat"><span className="profile-stat-value">5</span><span className="profile-stat-label">Articles Written</span></div>
            <div className="profile-stat"><span className="profile-stat-value">12</span><span className="profile-stat-label">Mentions</span></div>
            <div className="profile-stat"><span className="profile-stat-value">97%</span><span className="profile-stat-label">Response Rate</span></div>
          </div>
        </div>

        <div className="profile-widget">
          <div className="widget-header"><h4>Account Settings</h4></div>
          <div className="settings-list">
            <div className="settings-row">
              <span>Display Name</span>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="settings-input" placeholder="Your full name" />
            </div>
            <div className="settings-row">
              <span>Email</span>
              <input type="text" value={email} disabled className="settings-input" style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
            <div className="settings-row">
              <span>Department</span>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className="settings-input" placeholder="Your department" />
            </div>
            <div className="settings-row">
              <span>Role</span>
              <span className="badge badge-blue">{profile?.is_admin ? 'Admin' : 'User'}</span>
            </div>
            <div className="settings-row">
              <span>Notifications</span>
              <label className="toggle-switch">
                <input type="checkbox" defaultChecked />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ConsolesTab() {
  return (
    <div className="profile-tab-content">
      <h3>My Consoles</h3>
      <p className="tab-desc">Manage your active consoles and available cartridges.</p>
      <div className="console-grid big">
        {[
          { name: 'MarComm', icon: '📣', desc: 'Marketing & Communications', active: true },
          { name: 'Minutes', icon: '📋', desc: 'Meeting Minutes & Records', active: true },
          { name: 'WCM', icon: '🌐', desc: 'Web Content Management', active: false },
          { name: 'Analytics', icon: '📊', desc: 'Performance Analytics', active: true },
          { name: 'Events', icon: '📅', desc: 'Event Planning & Scheduling', active: false },
          { name: 'Media', icon: '🎨', desc: 'Media Library & Assets', active: false },
        ].map(c => (
          <div key={c.name} className={`console-card-big${c.active ? ' active' : ''}`}>
            <div className="console-icon-big">{c.icon}</div>
            <div className="console-name-big">{c.name}</div>
            <div className="console-desc-small">{c.desc}</div>
            <div className={`console-badge ${c.active ? 'active' : 'inactive'}`}>{c.active ? 'Active' : 'Add'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ArticlesTab() {
  return (
    <div className="profile-tab-content">
      <div className="tab-header-row">
        <div><h3>My Articles</h3><p className="tab-desc">Knowledge you&apos;ve shared with the team.</p></div>
        <button className="btn btn-primary">+ Write Article</button>
      </div>
      <div className="article-list">
        {ARTICLES.map(a => (
          <div key={a.id} className="article-card">
            <div className="article-title">{a.title}</div>
            <div className="article-meta"><span>{a.date}</span><span className="dot">·</span><span>{a.reads} reads</span></div>
            <div className="note-tags">{a.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
            <div className="article-actions"><button className="link-btn">Edit</button><button className="link-btn">View</button></div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MessagesTab() {
  const [selectedId, setSelectedId] = useState<number | null>(1)
  return (
    <div className="profile-tab-content">
      <div className="messages-layout">
        <div className="messages-list">
          {MESSAGES.map(msg => (
            <button key={msg.id} className={`message-row${selectedId === msg.id ? ' selected' : ''}${msg.unread ? ' unread' : ''}`} onClick={() => setSelectedId(msg.id)}>
              <div className="avatar avatar-sm" style={{ background: msg.color }}>{msg.initials}</div>
              <div className="message-preview"><div className="message-from">{msg.from}</div><div className="message-text">{msg.preview}</div></div>
              <div className="message-time">{msg.time}</div>
            </button>
          ))}
        </div>
        <div className="message-detail">
          {selectedId ? (
            <>
              <div className="message-detail-header">
                {(() => { const msg = MESSAGES.find(m => m.id === selectedId)!; return (<><div className="avatar" style={{ background: msg.color }}>{msg.initials}</div><div><strong>{msg.from}</strong><span>{msg.time}</span></div></>); })()}
              </div>
              <div className="message-body"><p>{MESSAGES.find(m => m.id === selectedId)?.preview}</p></div>
              <div className="message-reply"><input type="text" placeholder="Write a reply..." className="reply-input" /><button className="btn btn-primary">Send</button></div>
            </>
          ) : (
            <div className="message-empty">Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage({ subPage }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<TabId>((subPage as TabId) || 'missioncontrol')
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      // Ensure a row exists for this user
      await fetch('/api/cert/profile/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, email: user.email }),
      }).catch(() => {})
      const { data } = await supabase
        .from('wcm_cert_users')
        .select('full_name, department, is_admin')
        .eq('user_id', user.id)
        .maybeSingle()
      setProfile({
        userId: user.id,
        email: user.email ?? '',
        full_name: data?.full_name ?? null,
        department: data?.department ?? null,
        is_admin: data?.is_admin ?? false,
      })
    })
  }, [])

  const displayName = profile?.full_name || profile?.email?.split('@')[0] || 'You'
  const initials = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-avatar-wrap">
          <div className="avatar avatar-lg" style={{ background: '#1672A7' }}>{initials}</div>
        </div>
        <div className="profile-hero-info">
          <h2>{displayName}</h2>
          <p>{profile?.is_admin ? 'Admin' : 'User'} · {profile?.email}</p>
          <div className="profile-badges">
            <span className="badge badge-blue">{profile?.is_admin ? 'Admin' : 'User'}</span>
            <span className="badge badge-yellow">BETA</span>
          </div>
        </div>
      </div>

      <div className="profile-tabs">
        {TABS.map(tab => (
          <button key={tab.id} className={`profile-tab-btn${activeTab === tab.id ? ' active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            <span>{tab.icon}</span><span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'missioncontrol' && <MissionControlTab profile={profile} onProfileUpdate={setProfile} />}
      {activeTab === 'consoles' && <ConsolesTab />}
      {activeTab === 'articles' && <ArticlesTab />}
      {activeTab === 'messages' && <MessagesTab />}
    </div>
  )
}
