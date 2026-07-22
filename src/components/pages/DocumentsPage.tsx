'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface Document {
  id: string
  title: string
  description: string
  type: string
  date: string
  url: string
  icon: string
  restricted?: string[]
  section: 'documents' | 'meeting-notes' | 'records'
}

const SECTIONS = [
  { key: 'documents', label: 'Documents', description: 'Plans, governance frameworks, implementation guides, and reference documents.' },
  { key: 'meeting-notes', label: 'Meeting Notes', description: 'Notes and action items from platform sessions, hot labs, and planning meetings.' },
  { key: 'records', label: 'Records', description: 'Performance appraisals and confidential employment records.' },
]

const DOCUMENTS: Document[] = [
  {
    id: 'governance',
    title: 'Website Governance Plan',
    description: 'Strategic governance framework for the BCPS website, including roles, responsibilities, and decision-making processes.',
    type: 'Plan',
    date: 'June 10, 2026',
    url: '/briefs/bcps-website-governance-plan-2026-06-10.html',
    icon: '📋',
    section: 'documents',
  },
  {
    id: 'google-governance',
    title: 'Google Governance Plan',
    description: 'Strategic governance framework for Google Workspace and digital services integration.',
    type: 'Plan',
    date: '2026',
    url: '/briefs/google-governance-plan.html',
    icon: '🔒',
    section: 'documents',
  },
  {
    id: 'appas',
    title: 'APPAS Evaluation',
    description: 'Complete accessibility standards evaluation and recommendations for continuous improvement.',
    type: 'Assessment',
    date: '2026',
    url: '/bcps-appas-evaluation.html',
    icon: '✓',
    restricted: ['contact@lesaruss.com', 'farrah.wilson@browardschools.com'],
    section: 'records',
  },
  {
    id: 'impl-plan',
    title: 'Implementation Plan',
    description: 'Strategic implementation roadmap for accessibility and communications improvements across the district.',
    type: 'Plan',
    date: '2026-2027',
    url: '/bcps-implementation-plan-2026-2027.pdf',
    icon: '🗺️',
    section: 'documents',
  },
  {
    id: 'wcm-scope',
    title: 'WCM Scope of Work',
    description: 'Web Content Manager program scope: assignment workflow, certification tracking, multi-year audit management, and role-based access control.',
    type: 'Scope',
    date: 'June 24, 2026',
    url: '/briefs/bcps-wcm-scope-2026.html',
    icon: '🌐',
    restricted: [
      'contact@lesaruss.com',
      'farrah.wilson@browardschools.com',
      'felicia.hicks@browardschools.com',
      'rodolfo.carril@browardschools.com',
      'tricia.allen@browardschools.com',
      'vanessa.deslandes@browardschools.com',
      'yaco.abuelafia@browardschools.com',
    ],
    section: 'documents',
  },
  {
    id: 'dept-migrations',
    title: 'Departmental Migrations and Platform Pilots',
    description: 'Org chart transition response plan, platform pilot status, and departmental migration workflow for the July 1, 2026 org changes.',
    type: 'Planning',
    date: 'July 1, 2026',
    url: '/briefs/bcps-dept-migrations-2026-06-29',
    icon: '🗂️',
    restricted: [
      'contact@lesaruss.com',
      'farrah.wilson@browardschools.com',
      'felicia.hicks@browardschools.com',
    ],
    section: 'documents',
  },
  {
    id: 'hot-lab-2026-07-01',
    title: 'Hot Lab for Department WCMs - July 1, 2026',
    description: 'Platform demo and org chart migration confirmations with Lorena Balharry, Angela Tillman, Ronee Stratman, and Allan Llanos.',
    type: 'Meeting Notes',
    date: 'July 1, 2026',
    url: '/briefs/bcps-hot-lab-dept-wcms-2026-07-01',
    icon: '📝',
    restricted: [
      'contact@lesaruss.com',
      'farrah.wilson@browardschools.com',
      'felicia.hicks@browardschools.com',
    ],
    section: 'meeting-notes',
  },
  {
    id: 'appas-eval',
    title: 'APPAS Self-Evaluation 2024-2025',
    description: 'Performance evidence portfolio for the 2024-2025 BCPS APPAS Final appraisal. All seven domains with Highly Effective rating support.',
    type: 'Performance Appraisal',
    date: '2024-2025',
    url: '/bcps-appas-self-eval-2024-2025.html',
    icon: '📄',
    restricted: ['contact@lesaruss.com', 'farrah.wilson@browardschools.com'],
    section: 'records',
  },
  {
    id: 'find-it-fast-guide',
    title: 'Find It Fast: Editing Guide',
    description: 'Step-by-step walkthrough for editing the Find It Fast widget categories and links on the Back to School page, no code required.',
    type: 'Guide',
    date: 'July 21, 2026',
    url: '/briefs/bcps-find-it-fast-editing-guide.html',
    icon: '🔎',
    section: 'documents',
  },
]

export default function DocumentsPage() {
  const [preview, setPreview] = useState<Document | null>(null)
  const [email, setEmail] = useState<string>('')
  const [engineDocs, setEngineDocs] = useState<Document[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      setEmail((sess.session?.user?.email || '').toLowerCase())
      const token = sess.session?.access_token
      if (!token) return
      try {
        const r = await fetch('/api/bcps/my-documents', { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const j = await r.json()
          setEngineDocs((j.documents || []).map((d: { slug: string; title: string; url: string }) => ({
            id: 'eng-' + d.slug, title: d.title, description: 'Shared with you', type: 'Document', date: '', url: d.url, icon: '',
            section: 'documents' as const,
          })))
        }
      } catch { /* ignore */ }
    })()
  }, [])

  const staticVisible = DOCUMENTS.filter(d => !d.restricted || d.restricted.includes(email))
  const staticUrls = new Set(staticVisible.map(d => d.url))
  const visibleDocs = [...staticVisible, ...engineDocs.filter(d => !staticUrls.has(d.url))]

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
        .docs-section {
          padding: 32px;
          background: #ffffff;
        }
        .docs-header h1 {
          font-size: 32px;
          font-weight: 900;
          margin: 0 0 12px 0;
          text-transform: uppercase;
          letter-spacing: -0.02em;
        }
        .docs-header p {
          font-size: 14px;
          color: rgba(26,26,26,0.55);
          margin: 0 0 32px 0;
          line-height: 1.6;
        }
        .docs-section-group {
          margin-bottom: 48px;
        }
        .docs-section-label {
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          color: #1672A7;
          margin: 0 0 6px 0;
        }
        .docs-section-desc {
          font-size: 12px;
          color: rgba(26,26,26,0.45);
          margin: 0 0 20px 0;
          font-weight: 600;
        }
        .docs-section-divider {
          height: 1px;
          background: rgba(0,0,0,0.07);
          margin-bottom: 20px;
        }
        .docs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .doc-card {
          display: block;
          background: #ffffff;
          border: 1px solid rgba(0,0,0,0.09);
          border-radius: 8px;
          padding: 24px;
          cursor: pointer;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
          position: relative;
        }
        .doc-card:hover {
          border-color: #1672A7;
          box-shadow: 0 4px 16px rgba(22,114,167,0.15);
        }
        .doc-icon {
          width: 48px;
          height: 48px;
          background: rgba(22,114,167,0.08);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          font-size: 24px;
        }
        .doc-title {
          font-size: 16px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0 0 8px 0;
          line-height: 1.3;
        }
        .doc-description {
          font-size: 13px;
          color: rgba(26,26,26,0.55);
          margin: 0 0 16px 0;
          line-height: 1.5;
        }
        .doc-meta {
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
        .doc-type {
          background: rgba(22,114,167,0.10);
          color: #1672A7;
          padding: 3px 8px;
          border-radius: 3px;
        }
        .doc-type-notes {
          background: rgba(22,117,12,0.08);
          color: #16750C;
          padding: 3px 8px;
          border-radius: 3px;
        }
        .doc-type-record {
          background: rgba(197,83,38,0.07);
          color: #7d3018;
          padding: 3px 8px;
          border-radius: 3px;
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
          .docs-section { padding: 16px; }
          .docs-header h1 { font-size: 24px; }
          .docs-grid { grid-template-columns: 1fr; }
          .lightbox { padding: 12px; }
          .lightbox-content { max-width: 100%; }
        }
      `}</style>

      <div className="docs-section">
        <div className="docs-header">
          <h1>Documents</h1>
          <p>BCPS marketing communications plans, governance documents, meeting notes, and records. Click any document to preview.</p>
        </div>

        {SECTIONS.map(section => {
          const sectionDocs = visibleDocs.filter(d => (d.section || 'documents') === section.key)
          if (sectionDocs.length === 0) return null
          return (
            <div key={section.key} className="docs-section-group">
              <h2 className="docs-section-label">{section.label}</h2>
              <p className="docs-section-desc">{section.description}</p>
              <div className="docs-section-divider" />
              <div className="docs-grid">
                {sectionDocs.map(doc => (
                  <button
                    key={doc.id}
                    className="doc-card"
                    onClick={() => setPreview(doc)}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', all: 'unset' }}
                  >
                    <div className="doc-card" style={{ cursor: 'pointer' }}>
                      <div className="doc-icon">{doc.icon}</div>
                      <h2 className="doc-title">{doc.title}</h2>
                      <p className="doc-description">{doc.description}</p>
                      <div className="doc-meta">
                        <span className={
                          section.key === 'meeting-notes' ? 'doc-type-notes' :
                          section.key === 'records' ? 'doc-type-record' :
                          'doc-type'
                        }>{doc.type}</span>
                        <span>{doc.date}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
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
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lightbox-open-btn"
                >
                  Open full page ↗
                </a>
                <button
                  className="lightbox-close-btn"
                  onClick={() => setPreview(null)}
                  aria-label="Close preview"
                >
                  x
                </button>
              </div>
            </div>
            <iframe
              className="lightbox-iframe"
              src={preview.url}
              title={preview.title}
            />
          </div>
        </div>
      )}
    </div>
  )
}
