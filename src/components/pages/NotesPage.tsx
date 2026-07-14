'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Brief {
  id: string
  slug: string
  title: string
  summary: string | null
  created_at: string
}

const BriefIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1672A7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
)

export default function NotesPage() {
  const [briefs, setBriefs] = useState<Brief[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [preview, setPreview] = useState<Brief | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('mock_pages')
        .select('id, slug, title, summary, created_at')
        .eq('brand', 'bcps')
        .eq('surface', 'brief')
        .order('created_at', { ascending: false })
      setBriefs(data || [])
      setLoading(false)
    })()
  }, [])

  const filtered = useMemo(() => {
    let list = briefs
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(b => b.title.toLowerCase().includes(q))
    }
    return sortDir === 'desc' ? list : [...list].reverse()
  }, [briefs, search, sortDir])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
  }

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  return (
    <div style={{ padding: '0' }}>
      <style>{`
        .notes-section {
          padding: 32px;
          background: #ffffff;
        }
        .notes-header h1 {
          font-size: 32px;
          font-weight: 900;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: -0.02em;
        }
        .notes-header p {
          font-size: 14px;
          color: rgba(26,26,26,0.55);
          margin: 0 0 24px 0;
          line-height: 1.6;
        }
        .notes-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }
        .notes-search-wrap {
          position: relative;
          flex: 1;
          min-width: 200px;
        }
        .notes-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
        }
        .notes-search {
          width: 100%;
          padding: 9px 14px 9px 36px;
          border: 1.5px solid #e5e7eb;
          border-radius: 8px;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          background: #fff;
          color: #1a1a1a;
        }
        .notes-sort-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 9px 14px;
          border: 1.5px solid #e5e7eb;
          border-radius: 8px;
          background: #fff;
          font-size: 12px;
          font-weight: 700;
          color: #374151;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
        }
        .notes-count {
          font-size: 12px;
          color: #9ca3af;
          white-space: nowrap;
        }
        .notes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .brief-card {
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.09);
          border-radius: 8px;
          padding: 24px;
          cursor: pointer;
          text-align: left;
          width: 100%;
          font-family: inherit;
          transition: all 0.2s ease;
        }
        .brief-card:hover {
          border-color: #1672A7;
          box-shadow: 0 4px 16px rgba(22,114,167,0.15);
        }
        .brief-card-top {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .brief-icon {
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          background: rgba(22,114,167,0.08);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .brief-title {
          font-size: 15px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0;
          line-height: 1.35;
          text-align: left;
        }
        .brief-summary {
          font-size: 13px;
          color: rgba(26,26,26,0.55);
          margin: 0 0 16px 0;
          line-height: 1.5;
        }
        .brief-summary.brief-summary-empty {
          font-style: italic;
          color: rgba(26,26,26,0.35);
        }
        .brief-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 16px;
          border-top: 1px solid rgba(0,0,0,0.09);
          font-size: 11px;
          color: rgba(26,26,26,0.35);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 600;
        }
        .brief-type {
          background: rgba(22,114,167,0.10);
          color: #1672A7;
          padding: 3px 8px;
          border-radius: 3px;
        }
        .notes-empty {
          padding: 60px 0;
          text-align: center;
          color: #9ca3af;
          font-size: 14px;
        }
        .lightbox {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          display: none;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1000;
        }
        .lightbox.active {
          display: flex;
        }
        .lightbox-content {
          width: 100%;
          max-width: 1120px;
          height: 88vh;
          background: #ffffff;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .lightbox-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(0,0,0,0.09);
          flex-shrink: 0;
        }
        .lightbox-title {
          font-size: 13px;
          font-weight: 800;
          color: #1a1a1a;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }
        .lightbox-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .lightbox-open-btn {
          font-size: 11px;
          font-weight: 700;
          color: #7d4a00;
          text-decoration: none;
          border: 1px solid rgba(0,0,0,0.09);
          border-radius: 99px;
          padding: 6px 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          background: #ffffff;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .lightbox-open-btn:hover {
          border-color: #7d4a00;
          background: rgba(125,74,0,0.04);
        }
        .lightbox-close-btn {
          width: 32px;
          height: 32px;
          border-radius: 99px;
          border: 1px solid rgba(0,0,0,0.09);
          background: #ffffff;
          color: #1a1a1a;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
          font-family: inherit;
          font-weight: 400;
        }
        .lightbox-close-btn:hover {
          border-color: #1a1a1a;
          background: #fafafa;
        }
        .lightbox-iframe {
          flex: 1;
          width: 100%;
          border: none;
        }
        @media (max-width: 600px) {
          .notes-section { padding: 16px; }
          .notes-header h1 { font-size: 24px; }
          .notes-grid { grid-template-columns: 1fr; }
          .lightbox { padding: 12px; }
          .lightbox-content { max-width: 100%; }
        }
      `}</style>

      <div className="notes-section">
        <div className="notes-header">
          <h1>Meeting Notes</h1>
          <p>Published briefs from BCPS district meetings, planning sessions, and team huddles. Click any brief to preview inline.</p>
        </div>

        <div className="notes-toolbar">
          <div className="notes-search-wrap">
            <svg
              className="notes-search-icon"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#9ca3af" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="notes-search"
              placeholder="Search meeting notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search meeting notes"
            />
          </div>

          <button
            className="notes-sort-btn"
            onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {sortDir === 'desc'
                ? <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>
                : <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
              }
            </svg>
            {sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>

          <span className="notes-count">
            {loading ? 'Loading...' : `${filtered.length} brief${filtered.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {loading ? (
          <div className="notes-empty">Loading meeting notes...</div>
        ) : filtered.length === 0 ? (
          <div className="notes-empty">
            {search ? 'No briefs match your search.' : 'No meeting notes yet.'}
          </div>
        ) : (
          <div className="notes-grid">
            {filtered.map(brief => (
              <button
                key={brief.id}
                className="brief-card"
                onClick={() => setPreview(brief)}
              >
                <div className="brief-card-top">
                  <div className="brief-icon">
                    <BriefIcon />
                  </div>
                  <h2 className="brief-title">{brief.title}</h2>
                </div>
                <p className={`brief-summary${brief.summary ? '' : ' brief-summary-empty'}`}>
                  {brief.summary || 'No summary added yet.'}
                </p>
                <div className="brief-meta">
                  <span className="brief-type">Brief</span>
                  <span>{formatDate(brief.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {preview && (
        <div
          className="lightbox active"
          onClick={() => setPreview(null)}
        >
          <div
            className="lightbox-content"
            onClick={e => e.stopPropagation()}
          >
            <div className="lightbox-header">
              <span className="lightbox-title">{preview.title}</span>
              <div className="lightbox-actions">
                <a
                  href={`/briefs/${preview.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lightbox-open-btn"
                >
                  Open full page &#8599;
                </a>
                <button
                  className="lightbox-close-btn"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                >
                  &times;
                </button>
              </div>
            </div>
            <iframe
              className="lightbox-iframe"
              src={`/briefs/${preview.slug}`}
              title={preview.title}
            />
          </div>
        </div>
      )}
    </div>
  )
}
