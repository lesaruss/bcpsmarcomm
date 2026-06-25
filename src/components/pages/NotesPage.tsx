'use client'

import { useState, useEffect, useMemo } from 'react'

interface Note {
  id: string
  assignment_slug: string
  note_text: string
  author: string
  created_at: string
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    fetch('/api/bcps-notes')
      .then(r => r.json())
      .then(data => {
        setNotes(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let list = notes
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(n =>
        n.note_text.toLowerCase().includes(q) ||
        n.author.toLowerCase().includes(q) ||
        n.assignment_slug.toLowerCase().includes(q)
      )
    }
    return sortDir === 'desc' ? list : [...list].reverse()
  }, [notes, search, sortDir])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  }

  function formatSlug(slug: string) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div style={{ padding: '28px', maxWidth: '860px' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#9ca3af" strokeWidth="2"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            placeholder="Search meeting notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '9px 14px 9px 36px',
              border: '1.5px solid #e5e7eb', borderRadius: '8px',
              fontSize: '13px', fontFamily: 'inherit', outline: 'none',
              background: '#fff', color: '#1a1a1a',
            }}
          />
        </div>

        <button
          onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '9px 14px', border: '1.5px solid #e5e7eb', borderRadius: '8px',
            background: '#fff', fontSize: '12px', fontWeight: 700,
            color: '#374151', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {sortDir === 'desc'
              ? <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
              : <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
            }
          </svg>
          {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>

        <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {loading ? 'Loading...' : `${filtered.length} note${filtered.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          Loading meeting notes...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
          {search ? 'No notes match your search.' : 'No meeting notes yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(n => (
            <div
              key={n.id}
              style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
                padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ marginBottom: '4px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.1em', padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(22,114,167,0.08)', color: '#1672A7',
                    }}>
                      {formatSlug(n.assignment_slug)}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {n.author} &middot; {formatDate(n.created_at)}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '13px', color: '#374151', lineHeight: 1.65, margin: 0 }}>
                {n.note_text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
