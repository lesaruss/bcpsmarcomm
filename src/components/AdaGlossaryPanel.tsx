'use client'

// components/AdaGlossaryPanel.tsx
//
// Standalone, searchable browser for the ADA issue glossary (lib/ada-glossary.ts).
// Lets a WCM search by rule name or a word from the definition even when they
// aren't looking at a scan result, "I know what the error is, let me just look
// it up." Built 2026-08-28 for the Application Services kickoff pilot.

import { useMemo, useState } from 'react'
import { ADA_GLOSSARY, CATEGORY_LABELS, type GlossaryEntry, type GlossaryOwner } from '@/lib/ada-glossary'

const OWNER_META: Record<GlossaryOwner, { label: string; color: string; bg: string }> = {
  wcm:       { label: 'WCM',       color: '#fff',    bg: '#16750C' },
  finalsite: { label: 'FinalSite', color: '#fff',    bg: '#C55326' },
  depends:   { label: 'Depends',   color: '#2b2200', bg: '#D4B106' },
}

function OwnerTag({ owner }: { owner: GlossaryOwner }) {
  const m = OWNER_META[owner]
  return (
    <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: m.color, background: m.bg, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

export function EntryCard({ entry, highlight }: { entry: GlossaryEntry; highlight?: string }) {
  const borderColor = entry.owner === 'wcm' ? '#BFE0BA' : entry.owner === 'finalsite' ? '#EAC3AE' : '#E6D68C'
  const bg = entry.owner === 'wcm' ? '#F5FBF4' : entry.owner === 'finalsite' ? '#FDF6F2' : '#FDFAEF'
  return (
    <div style={{ border: `1px solid ${borderColor}`, borderLeft: `4px solid ${OWNER_META[entry.owner].bg}`, background: bg, borderRadius: 6, padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{entry.title}</div>
          <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>
            {entry.source === 'axe' ? `axe-core: ${entry.axeId}` : 'WAVE'}
            {entry.seenOnPilot ? ' · seen on Silver Ridge pilot scan' : ''}
          </div>
        </div>
        <OwnerTag owner={entry.owner} />
      </div>
      <p style={{ fontSize: 13, color: '#374151', margin: '8px 0 0' }}>{entry.definition}</p>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e5e7eb', fontSize: 12, color: '#6b7280' }}>
        <b style={{ color: '#374151' }}>{entry.owner === 'finalsite' ? 'Escalation: ' : entry.owner === 'depends' ? 'How to tell: ' : 'Fix: '}</b>
        {entry.ownerNote}
      </div>
      {entry.fixSteps && entry.fixSteps.length > 0 && (
        <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, color: '#374151' }}>
          {entry.fixSteps.map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}
        </ol>
      )}
      {entry.escalationNote && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#9a5b3b' }}>{entry.escalationNote}</div>
      )}
    </div>
  )
}

export default function AdaGlossaryPanel() {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return ADA_GLOSSARY
    return ADA_GLOSSARY.filter(e =>
      e.title.toLowerCase().includes(term) ||
      e.definition.toLowerCase().includes(term) ||
      e.ownerNote.toLowerCase().includes(term) ||
      (e.axeId ?? '').toLowerCase().includes(term) ||
      e.source.includes(term)
    )
  }, [q])

  const grouped = useMemo(() => {
    const map = new Map<string, GlossaryEntry[]>()
    for (const e of filtered) {
      if (!map.has(e.category)) map.set(e.category, [])
      map.get(e.category)!.push(e)
    }
    return map
  }, [filtered])

  const counts = useMemo(() => {
    const wcm = ADA_GLOSSARY.filter(e => e.owner === 'wcm').length
    const finalsite = ADA_GLOSSARY.filter(e => e.owner === 'finalsite').length
    const depends = ADA_GLOSSARY.filter(e => e.owner === 'depends').length
    return { wcm, finalsite, depends }
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#16750C', background: '#EFF7EE', border: '1px solid #BFE0BA', borderRadius: 999, padding: '3px 10px' }}>{counts.wcm} WCM fixes directly</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#C55326', background: '#FBF0EB', border: '1px solid #EAC3AE', borderRadius: 999, padding: '3px 10px' }}>{counts.finalsite} FinalSite only</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8A7502', background: '#FBF6E7', border: '1px solid #E6D68C', borderRadius: 999, padding: '3px 10px' }}>{counts.depends} depends on where it fires</span>
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search a rule name, axe-core id, or a word from the definition…"
          style={{ width: '100%', padding: '10px 36px 10px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13.5, fontFamily: 'inherit' }}
        />
        {q && (
          <button
            onClick={() => setQ('')}
            aria-label="Clear search"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#9ca3af', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 14 }}>
        {q
          ? `Showing ${filtered.length} of ${ADA_GLOSSARY.length} entries for "${q.trim()}".`
          : `Showing all ${ADA_GLOSSARY.length} entries. This is the draft seed list, real scans will surface more findings over time, that's what this search is for.`}
      </div>

      {filtered.length === 0 ? (
        <div style={{ border: '1px dashed #e5e7eb', borderRadius: 8, padding: 20, textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
          No glossary entry matches that search yet. If a scan turns up a finding not listed here, it needs a new entry, not a live-written explanation.
        </div>
      ) : (
        Array.from(grouped.entries()).map(([cat, entries]) => (
          <div key={cat} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', borderBottom: '1px solid #f3f4f6', paddingBottom: 6, marginBottom: 10 }}>
              {CATEGORY_LABELS[cat as GlossaryEntry['category']]}
            </div>
            {entries.map(e => <EntryCard key={e.key} entry={e} />)}
          </div>
        ))
      )}
    </div>
  )
}
