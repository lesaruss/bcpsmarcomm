'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface MinibaseFolder {
  id: string
  slug: string
  name: string
  description: string
  department: string
}

interface MinibaseDocument {
  id: string
  folder_id: string
  title: string
  description: string
  url: string
  file_type: string
  tags: string[]
  categories: string[]
  is_embedded: boolean
  created_at: string
}

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc',  label: 'Oldest first' },
  { value: 'name-asc',  label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
]

// Flat SVG icons
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
)

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

const DocIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'pdf':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
        </svg>
      )
    case 'link':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      )
    default:
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
      )
  }
}

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export default function MinibsePage() {
  const [folders, setFolders] = useState<MinibaseFolder[]>([])
  const [documents, setDocuments] = useState<MinibaseDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('date-desc')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [preview, setPreview] = useState<MinibaseDocument | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) { setLoading(false); return }
      try {
        const r = await fetch('/api/bcps/minibase', { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const j = await r.json()
          setFolders(j.folders || [])
          setDocuments(j.documents || [])
        }
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // All unique tags + categories from loaded documents
  const allTags = useMemo(() => {
    const s = new Set<string>()
    documents.forEach(d => d.tags?.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [documents])

  const allCategories = useMemo(() => {
    const s = new Set<string>()
    documents.forEach(d => d.categories?.forEach(c => s.add(c)))
    return Array.from(s).sort()
  }, [documents])

  // Filtered + sorted
  const filtered = useMemo(() => {
    let docs = [...documents]
    if (selectedFolder) docs = docs.filter(d => d.folder_id === selectedFolder)
    if (selectedTags.length > 0) docs = docs.filter(d => selectedTags.some(t => d.tags?.includes(t)))
    if (selectedCategories.length > 0) docs = docs.filter(d => selectedCategories.some(c => d.categories?.includes(c)))
    if (search.trim()) {
      const q = search.toLowerCase()
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q) ||
        d.tags?.some(t => t.toLowerCase().includes(q)) ||
        d.categories?.some(c => c.toLowerCase().includes(q))
      )
    }
    switch (sortBy) {
      case 'name-asc':  docs.sort((a, b) => a.title.localeCompare(b.title)); break
      case 'name-desc': docs.sort((a, b) => b.title.localeCompare(a.title)); break
      case 'date-asc':  docs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break
      case 'date-desc': default: docs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break
    }
    return docs
  }, [documents, selectedFolder, selectedTags, selectedCategories, search, sortBy])

  const toggleTag = (tag: string) =>
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])

  const toggleCategory = (cat: string) =>
    setSelectedCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])

  const hasActiveFilters = selectedFolder || selectedTags.length > 0 || selectedCategories.length > 0 || search.trim()

  const clearAll = () => {
    setSelectedFolder(null)
    setSelectedTags([])
    setSelectedCategories([])
    setSearch('')
  }

  return (
    <div style={{ padding: 0 }}>
      <style>{`
        .mb-page { padding: 32px; background: #fff; min-height: 100%; }

        /* Toolbar */
        .mb-toolbar {
          display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
          margin-bottom: 24px;
        }
        .mb-search-wrap {
          position: relative; flex: 1; min-width: 200px; max-width: 360px;
        }
        .mb-search-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: rgba(26,26,26,0.4); pointer-events: none;
        }
        .mb-search {
          width: 100%; padding: 9px 12px 9px 38px;
          border: 1.5px solid rgba(0,0,0,0.12); border-radius: 8px;
          font-size: 13px; font-family: inherit; color: #1a1a1a;
          background: #fff; outline: none; transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .mb-search:focus { border-color: #1672A7; }
        .mb-search::placeholder { color: rgba(26,26,26,0.4); }

        .mb-sort {
          padding: 9px 12px; border: 1.5px solid rgba(0,0,0,0.12);
          border-radius: 8px; font-size: 13px; font-family: inherit;
          color: #1a1a1a; background: #fff; cursor: pointer; outline: none;
          transition: border-color 0.15s;
        }
        .mb-sort:focus { border-color: #1672A7; }

        .mb-clear-btn {
          padding: 9px 14px; border: 1.5px solid rgba(22,114,167,0.3);
          border-radius: 8px; font-size: 12px; font-weight: 700; font-family: inherit;
          color: #1672A7; background: rgba(22,114,167,0.06); cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
        }
        .mb-clear-btn:hover { border-color: #1672A7; background: rgba(22,114,167,0.12); }

        /* Folder pills row */
        .mb-folders { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .mb-folder-pill {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
          border: 1.5px solid transparent; white-space: nowrap;
        }
        .mb-folder-pill.all { background: #1672A7; color: #fff; border-color: #1672A7; }
        .mb-folder-pill.all.inactive { background: #fff; color: rgba(26,26,26,0.55); border-color: rgba(0,0,0,0.12); }
        .mb-folder-pill.inactive:hover { border-color: #1672A7; color: #1672A7; }
        .mb-folder-pill.active { background: rgba(22,114,167,0.1); color: #1672A7; border-color: #1672A7; }

        /* Tag + category filter rows */
        .mb-filter-section { margin-bottom: 12px; }
        .mb-filter-label {
          font-size: 10px; font-weight: 900; text-transform: uppercase;
          letter-spacing: 0.15em; color: rgba(26,26,26,0.4); margin-bottom: 8px;
          display: flex; align-items: center; gap: 10px;
        }
        .mb-filter-toggle {
          font-size: 10px; font-weight: 700; color: #1672A7;
          background: none; border: none; cursor: pointer; padding: 0;
          font-family: inherit; text-transform: none; letter-spacing: 0;
        }
        .mb-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .mb-pill {
          padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
          border: 1.5px solid rgba(0,0,0,0.12); background: #fff; color: rgba(26,26,26,0.7);
        }
        .mb-pill.active { background: rgba(22,114,167,0.1); color: #1672A7; border-color: #1672A7; }
        .mb-pill:hover:not(.active) { border-color: rgba(22,114,167,0.4); color: #1672A7; }

        /* Stats row */
        .mb-stats {
          font-size: 12px; color: rgba(26,26,26,0.45); font-weight: 600;
          margin-bottom: 20px; display: flex; align-items: center; gap: 6px;
        }
        .mb-divider { height: 1px; background: rgba(0,0,0,0.07); margin-bottom: 24px; }

        /* Grid */
        .mb-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .mb-card {
          background: #fff; border: 1.5px solid rgba(0,0,0,0.09);
          border-radius: 10px; padding: 22px; cursor: pointer;
          text-align: left; width: 100%; font-family: inherit;
          transition: all 0.15s; position: relative;
        }
        .mb-card:hover { border-color: #1672A7; box-shadow: 0 4px 16px rgba(22,114,167,0.13); }
        .mb-card-icon {
          width: 44px; height: 44px; border-radius: 8px;
          background: rgba(22,114,167,0.08); display: flex;
          align-items: center; justify-content: center;
          color: #1672A7; margin-bottom: 14px; flex-shrink: 0;
        }
        .mb-card-title {
          font-size: 15px; font-weight: 700; color: #1a1a1a;
          margin: 0 0 8px 0; line-height: 1.3;
        }
        .mb-card-desc {
          font-size: 12px; color: rgba(26,26,26,0.55); margin: 0 0 14px 0; line-height: 1.5;
        }
        .mb-card-footer {
          display: flex; align-items: flex-start; gap: 6px;
          flex-wrap: wrap; padding-top: 14px;
          border-top: 1px solid rgba(0,0,0,0.07);
        }
        .mb-tag-chip {
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          border-radius: 4px; background: rgba(22,114,167,0.08);
          color: #1672A7; text-transform: uppercase; letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .mb-cat-chip {
          font-size: 10px; font-weight: 700; padding: 3px 8px;
          border-radius: 4px; background: rgba(22,117,12,0.07);
          color: #16750C; text-transform: uppercase; letter-spacing: 0.06em;
          white-space: nowrap;
        }
        .mb-empty {
          text-align: center; padding: 64px 24px;
          color: rgba(26,26,26,0.35); font-size: 14px;
        }
        .mb-empty svg { margin-bottom: 12px; opacity: 0.3; }

        /* Loading skeleton */
        .mb-skeleton { border-radius: 8px; background: #f0f0f0; animation: mb-pulse 1.4s ease-in-out infinite; }
        @keyframes mb-pulse { 0%,100%{opacity:1}50%{opacity:0.5} }

        /* Lightbox */
        .mb-lightbox {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          padding: 24px; z-index: 1000;
        }
        .mb-lightbox-content {
          width: 100%; max-width: 1100px; height: 88vh;
          background: #fff; border-radius: 12px; overflow: hidden;
          display: flex; flex-direction: column;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        }
        .mb-lightbox-header {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.09); flex-shrink: 0;
        }
        .mb-lightbox-title {
          font-size: 13px; font-weight: 800; color: #1a1a1a;
          text-transform: uppercase; letter-spacing: 0.05em;
          flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .mb-lightbox-open {
          font-size: 11px; font-weight: 700; color: #1672A7;
          text-decoration: none; border: 1.5px solid rgba(22,114,167,0.3);
          border-radius: 99px; padding: 6px 14px;
          transition: all 0.15s; white-space: nowrap;
        }
        .mb-lightbox-open:hover { border-color: #1672A7; background: rgba(22,114,167,0.06); }
        .mb-lightbox-close {
          width: 32px; height: 32px; border-radius: 99px;
          border: 1.5px solid rgba(0,0,0,0.12); background: #fff;
          color: #1a1a1a; cursor: pointer; display: flex;
          align-items: center; justify-content: center; flex-shrink: 0;
          transition: all 0.15s; font-family: inherit;
        }
        .mb-lightbox-close:hover { border-color: #1a1a1a; }
        .mb-lightbox-iframe { flex: 1; width: 100%; border: none; }

        @media (max-width: 600px) {
          .mb-page { padding: 16px; }
          .mb-grid { grid-template-columns: 1fr; }
          .mb-lightbox { padding: 12px; }
        }
      `}</style>

      <div className="mb-page">
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '-0.02em', color: '#1a1a1a' }}>
            Minibase
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(26,26,26,0.55)', margin: 0, lineHeight: 1.6 }}>
            Departmental document library. Browse, filter, and search by folder, tag, or category.
          </p>
        </div>

        {/* Toolbar: search + sort */}
        <div className="mb-toolbar">
          <div className="mb-search-wrap">
            <span className="mb-search-icon"><SearchIcon /></span>
            <input
              type="text"
              className="mb-search"
              placeholder="Search by title, tag, or category..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="mb-sort"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            aria-label="Sort documents"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button className="mb-clear-btn" onClick={clearAll}>
              Clear filters
            </button>
          )}
        </div>

        {/* Folder filter pills */}
        {folders.length > 0 && (
          <div className="mb-filter-section">
            <div className="mb-filter-label">Folders</div>
            <div className="mb-folders">
              <button
                className={`mb-folder-pill all${selectedFolder === null ? '' : ' inactive'}`}
                onClick={() => setSelectedFolder(null)}
              >
                <FolderIcon /> All
              </button>
              {folders.map(f => (
                <button
                  key={f.id}
                  className={`mb-folder-pill${selectedFolder === f.id ? ' active' : ' inactive'}`}
                  onClick={() => setSelectedFolder(prev => prev === f.id ? null : f.id)}
                >
                  <FolderIcon /> {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Category pills */}
        {allCategories.length > 0 && (
          <div className="mb-filter-section">
            <div className="mb-filter-label">
              Categories
              <button className="mb-filter-toggle" onClick={() =>
                selectedCategories.length === allCategories.length ? setSelectedCategories([]) : setSelectedCategories(allCategories)
              }>
                {selectedCategories.length === allCategories.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="mb-pills">
              {allCategories.map(c => (
                <button key={c} className={`mb-pill${selectedCategories.includes(c) ? ' active' : ''}`} onClick={() => toggleCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tag pills */}
        {allTags.length > 0 && (
          <div className="mb-filter-section" style={{ marginBottom: 20 }}>
            <div className="mb-filter-label">
              Tags
              <button className="mb-filter-toggle" onClick={() =>
                selectedTags.length === allTags.length ? setSelectedTags([]) : setSelectedTags(allTags)
              }>
                {selectedTags.length === allTags.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="mb-pills">
              {allTags.map(t => (
                <button key={t} className={`mb-pill${selectedTags.includes(t) ? ' active' : ''}`} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats + divider */}
        {!loading && (
          <div className="mb-stats">
            <span>{filtered.length} document{filtered.length !== 1 ? 's' : ''}</span>
            {hasActiveFilters && <span style={{ color: '#1672A7' }}>- filtered</span>}
          </div>
        )}
        <div className="mb-divider" />

        {/* Content */}
        {loading ? (
          <div className="mb-grid">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ height: 180 }} className="mb-skeleton" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mb-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p style={{ margin: '0 0 12px 0', fontWeight: 700, color: 'rgba(26,26,26,0.5)' }}>No documents found</p>
            {hasActiveFilters && (
              <button className="mb-clear-btn" onClick={clearAll} style={{ margin: '0 auto' }}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="mb-grid">
            {filtered.map(doc => {
              const folderName = folders.find(f => f.id === doc.folder_id)?.name
              return (
                <button
                  key={doc.id}
                  className="mb-card"
                  onClick={() => doc.url ? setPreview(doc) : undefined}
                  disabled={!doc.url}
                  style={!doc.url ? { cursor: 'default', opacity: 0.7 } : undefined}
                >
                  <div className="mb-card-icon">
                    <DocIcon type={doc.file_type} />
                  </div>
                  <h2 className="mb-card-title">{doc.title}</h2>
                  {doc.description && <p className="mb-card-desc">{doc.description}</p>}
                  <div className="mb-card-footer">
                    {folderName && (
                      <span className="mb-tag-chip" style={{ background: 'rgba(0,0,0,0.04)', color: 'rgba(26,26,26,0.45)' }}>
                        {folderName}
                      </span>
                    )}
                    {doc.categories?.map(c => (
                      <span key={c} className="mb-cat-chip">{c}</span>
                    ))}
                    {doc.tags?.map(t => (
                      <span key={t} className="mb-tag-chip">{t}</span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox preview */}
      {preview && (
        <div
          className="mb-lightbox"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label={preview.title}
        >
          <div className="mb-lightbox-content" onClick={e => e.stopPropagation()}>
            <div className="mb-lightbox-header">
              <span className="mb-lightbox-title">{preview.title}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-lightbox-open"
                >
                  Open full page
                </a>
                <button
                  className="mb-lightbox-close"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <iframe
              className="mb-lightbox-iframe"
              src={preview.url}
              title={preview.title}
            />
          </div>
        </div>
      )}
    </div>
  )
}
