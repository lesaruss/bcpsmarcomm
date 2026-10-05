'use client'

import { useState } from 'react'
import { SAMPLE_ROLE_MEMBERS, type TeamMember } from '@/components/Sidebar'

// "View as" with sample people only, never a real person's dashboard (Sean,
// 2026-10-01). Used on the SuperAdmin dashboard and, since the left menu was
// retired (2026-10-02), in the top bar for anyone granted View as access.
// `groups` limits the choices to the tiers a grant allows; null shows all.

export const VIEW_AS_CHOICES: { id: string; label: string; desc: string }[] = [
  { id: 'SDR', label: 'Director', desc: 'A director with two sample departments.' },
  { id: 'SWC', label: 'Web Content Manager', desc: 'A department WCM working on certification.' },
  { id: 'SSW', label: 'School WCM', desc: 'A school WCM who submits homepage banners.' },
  { id: 'SDW', label: 'Web Team: Communications', desc: 'The department side of the District Web Team.' },
  { id: 'SDA', label: 'Web Team: Application Services', desc: 'ADA, schools and tools.' },
]

export default function ViewAsButton({ onPick, groups = null, className = 'wcm-hub2-card-btn' }: {
  onPick: (member: TeamMember) => void
  groups?: string[] | null
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const choices = VIEW_AS_CHOICES
    .map((c) => ({ c, member: SAMPLE_ROLE_MEMBERS.find((m) => m.id === c.id) }))
    .filter((x): x is { c: typeof VIEW_AS_CHOICES[number]; member: TeamMember } =>
      !!x.member && (!groups || (!!x.member.previewGroup && groups.includes(x.member.previewGroup))))
  if (!choices.length) return null
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>View as</button>
      {open && (
        <div className="home-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="home-modal" role="dialog" aria-modal="true" aria-labelledby="viewas-title">
            <h2 id="viewas-title">View the dashboard as</h2>
            <p className="home-card-text">A sample person in each group. Return to your view any time.</p>
            <div className="home-modal-list">
              {choices.map(({ c, member }) => (
                <button key={c.id} type="button" className="home-tool" onClick={() => { setOpen(false); onPick(member) }}>
                  <span className="home-tool-ic" aria-hidden="true">{c.label.replace('Web Team: ', '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2)}</span>
                  <span><b>{c.label}</b><small>{c.desc}</small></span>
                </button>
              ))}
            </div>
            <div className="home-actions"><button type="button" className="wcm-hub2-card-btn" onClick={() => setOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  )
}
