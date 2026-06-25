'use client'

import { useState } from 'react'

type WCMView = 'hub' | 'school' | 'department'

/* ─── HUB ─────────────────────────────────────────────── */
function WCMHub({ onNavigate }: { onNavigate: (v: WCMView) => void }) {
  return (
    <div className="wcm-hub">

      {/* Hero */}
      <div className="wcm-hero">
        <div className="wcm-hero-text">
          <div className="wcm-eyebrow">WCM Community</div>
          <h1 className="wcm-hero-title">Welcome to the<br />WCM Community Hub!</h1>
          <div className="wcm-hero-divider" />
          <p>Your central hub for managing BCPS websites. Access tutorials, guidelines, and updates to keep your pages accurate, accessible, and engaging. The District Web Team is here to support a consistent and high-quality online experience across all sites.</p>
        </div>
        <div className="wcm-hero-badge">
          <div className="wcm-cert-badge">
            <div className="wcm-cert-inner">
              <div className="wcm-cert-logo">BCPS</div>
              <div className="wcm-cert-line1">WEB CONTENT</div>
              <div className="wcm-cert-line2">MANAGER</div>
              <div className="wcm-cert-line3">CERTIFIED</div>
              <div className="wcm-cert-year">2026</div>
            </div>
          </div>
        </div>
      </div>

      {/* Portal Cards */}
      <div className="wcm-portals">
        <button className="wcm-portal-card school" onClick={() => onNavigate('school')}>
          <div className="wcm-portal-header">
            <span className="wcm-portal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </span>
            <h2>School WCMS</h2>
          </div>
          <div className="wcm-portal-body">
            <p>Access tools, tutorials, and resources to help you manage your school website with confidence. Explore best practices, Finalsite guides, and key updates to keep your pages accurate, accessible, and aligned with district standards.</p>
          </div>
          <div className="wcm-portal-cta">
            School Portal <span>→</span>
          </div>
        </button>

        <button className="wcm-portal-card department" onClick={() => onNavigate('department')}>
          <div className="wcm-portal-header">
            <span className="wcm-portal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
                <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
              </svg>
            </span>
            <h2>Department WCMS</h2>
          </div>
          <div className="wcm-portal-body">
            <p>Find everything you need to manage and maintain your department site. Review audit resources, layout templates, and training materials designed to support consistency, compliance, and communication across all BCPS department websites.</p>
          </div>
          <div className="wcm-portal-cta">
            Department Portal <span>→</span>
          </div>
        </button>
      </div>

      {/* Quick Resources */}
      <div className="wcm-quick-section">
        <h3>Quick Resources</h3>
        <div className="wcm-quick-grid">
          {[
            { icon: '▢', title: 'Content Guidelines', desc: 'District standards for writing and formatting web content' },
            { icon: '✓', title: 'Accessibility Checklist', desc: 'ADA compliance requirements for all BCPS pages' },
            { icon: '◼', title: 'Image & Media Standards', desc: 'File types, sizes, and alt text requirements' },
            { icon: '⟶', title: 'Link Policy', desc: 'Guidelines for internal and external links' },
            { icon: '□', title: 'Content Calendar', desc: 'District-wide publishing schedule and deadlines' },
            { icon: '?', title: 'Submit a Support Ticket', desc: 'Get help from the District Web Team' },
          ].map(r => (
            <div key={r.title} className="wcm-quick-card">
              <div className="wcm-quick-icon">{r.icon}</div>
              <div className="wcm-quick-info">
                <strong>{r.title}</strong>
                <span>{r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── SCHOOL PORTAL ───────────────────────────────────── */
function SchoolPortal({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState('getting-started')

  const sections = [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'tutorials', label: 'Tutorials' },
    { id: 'best-practices', label: 'Best Practices' },
    { id: 'finalsite', label: 'Finalsite Guides' },
    { id: 'updates', label: 'Updates & Alerts' },
  ]

  return (
    <div className="wcm-portal-page">
      <button className="wcm-back-btn" onClick={onBack}>← WCM Community Hub</button>

      <div className="wcm-portal-hero school-hero">
        <div>
          <h2>School WCMS Portal</h2>
          <p>Everything you need to manage your school website with confidence.</p>
        </div>
        <div className="wcm-portal-hero-badge">School Web Managers</div>
      </div>

      <div className="wcm-portal-layout">
        {/* Sidebar Nav */}
        <nav className="wcm-subnav">
          {sections.map(s => (
            <button
              key={s.id}
              className={`wcm-subnav-btn${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="wcm-portal-content">
          {activeSection === 'getting-started' && (
            <div className="wcm-content-section">
              <h3>Getting Started</h3>
              <p className="wcm-section-intro">New to managing your school website? Start here to get up and running quickly.</p>
              <div className="wcm-steps">
                {[
                  { step: '01', title: 'Request Finalsite Access', desc: 'Submit a request to the District Web Team to get your Finalsite CMS login credentials.' },
                  { step: '02', title: 'Complete WCM Training', desc: 'Attend a district-led WCM training session or complete the self-paced online course.' },
                  { step: '03', title: 'Review Content Standards', desc: 'Familiarize yourself with BCPS content guidelines, tone, and formatting rules.' },
                  { step: '04', title: 'Audit Your Existing Pages', desc: 'Use the page audit checklist to review and update your current school website content.' },
                  { step: '05', title: 'Get Certified', desc: 'Complete the WCM certification to become an official BCPS Web Content Manager.' },
                ].map(s => (
                  <div key={s.step} className="wcm-step-card">
                    <div className="wcm-step-num">{s.step}</div>
                    <div className="wcm-step-info">
                      <strong>{s.title}</strong>
                      <p>{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'tutorials' && (
            <div className="wcm-content-section">
              <h3>Tutorials</h3>
              <p className="wcm-section-intro">Step-by-step guides for common web content management tasks.</p>
              <div className="wcm-tutorial-grid">
                {[
                  { title: 'How to Update Your Homepage Banner', duration: '5 min', level: 'Beginner' },
                  { title: 'Adding Staff Directory Entries', duration: '8 min', level: 'Beginner' },
                  { title: 'Creating and Publishing News Posts', duration: '6 min', level: 'Beginner' },
                  { title: 'Uploading and Managing Documents', duration: '4 min', level: 'Beginner' },
                  { title: 'Embedding Calendars and Events', duration: '10 min', level: 'Intermediate' },
                  { title: 'Building Photo Gallery Pages', duration: '12 min', level: 'Intermediate' },
                  { title: 'Working with Page Templates', duration: '15 min', level: 'Intermediate' },
                  { title: 'SEO Best Practices in Finalsite', duration: '9 min', level: 'Advanced' },
                ].map(t => (
                  <div key={t.title} className="wcm-tutorial-card">
                    <div className="wcm-tutorial-icon">▶</div>
                    <div className="wcm-tutorial-info">
                      <strong>{t.title}</strong>
                      <div className="wcm-tutorial-meta">
                        <span>⏱ {t.duration}</span>
                        <span className={`wcm-level ${t.level.toLowerCase()}`}>{t.level}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'best-practices' && (
            <div className="wcm-content-section">
              <h3>Best Practices</h3>
              <p className="wcm-section-intro">Follow these guidelines to keep your school website accurate, accessible, and on-brand.</p>
              <div className="wcm-practices-list">
                {[
                  {
                    category: 'Content Quality',
                    items: ['Review all pages at the start of each school year', 'Remove outdated event listings and expired documents', 'Keep staff directory information current', 'Use clear, plain language appropriate for all audiences'],
                  },
                  {
                    category: 'Accessibility',
                    items: ['Add descriptive alt text to all images', 'Ensure all PDFs are accessible (tagged, searchable)', 'Use sufficient color contrast for text', 'Do not rely on color alone to convey information'],
                  },
                  {
                    category: 'Branding & Style',
                    items: ['Use only approved BCPS fonts and color palette', 'Do not upload low-resolution or blurry images', 'Follow the district photography guidelines', 'Use approved logo files only — never stretch or distort'],
                  },
                  {
                    category: 'Legal & Compliance',
                    items: ['Never publish student photos without a signed media release', 'Do not link to external sites without approval', 'Keep all copyright-protected material off public pages', 'Comply with FERPA requirements for student information'],
                  },
                ].map(p => (
                  <div key={p.category} className="wcm-practice-group">
                    <h4>{p.category}</h4>
                    <ul>
                      {p.items.map(item => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'finalsite' && (
            <div className="wcm-content-section">
              <h3>Finalsite Guides</h3>
              <p className="wcm-section-intro">Official documentation and guides for the Finalsite CMS platform used across BCPS.</p>
              <div className="wcm-doc-list">
                {[
                  { title: 'Finalsite Quick Start Guide', type: 'PDF', size: '2.4 MB', updated: 'Jan 2026' },
                  { title: 'Page Editor Reference Manual', type: 'PDF', size: '5.1 MB', updated: 'Feb 2026' },
                  { title: 'Composer Module Guide', type: 'PDF', size: '3.8 MB', updated: 'Jan 2026' },
                  { title: 'Forms & Surveys Setup Guide', type: 'PDF', size: '1.9 MB', updated: 'Mar 2026' },
                  { title: 'News & Announcements Module', type: 'PDF', size: '2.2 MB', updated: 'Dec 2025' },
                  { title: 'Staff Directory Module Guide', type: 'PDF', size: '1.6 MB', updated: 'Jan 2026' },
                ].map(d => (
                  <div key={d.title} className="wcm-doc-row">
                    <div className="wcm-doc-icon">📄</div>
                    <div className="wcm-doc-info">
                      <strong>{d.title}</strong>
                      <span>Updated {d.updated} · {d.size}</span>
                    </div>
                    <span className="wcm-doc-type">{d.type}</span>
                    <button className="wcm-doc-download">↓ Download</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'updates' && (
            <div className="wcm-content-section">
              <h3>Updates & Alerts</h3>
              <p className="wcm-section-intro">Latest news and important notices from the District Web Team.</p>
              <div className="wcm-updates-list">
                {[
                  { date: 'Apr 10, 2026', type: 'alert', title: 'Required: Accessibility Audit Due April 30', body: 'All school WCMs must complete the annual accessibility audit checklist and submit to the Web Team by April 30, 2026.' },
                  { date: 'Mar 25, 2026', type: 'update', title: 'Finalsite Spring 2026 Update Released', body: 'The latest Finalsite platform update introduces a new drag-and-drop page builder. See the updated guide in the Finalsite Guides section.' },
                  { date: 'Mar 12, 2026', type: 'tip', title: 'Tip: Use the New Image Optimization Tool', body: 'The Web Team has added a new image optimization tool to the media library. All uploaded images are now automatically compressed.' },
                  { date: 'Feb 28, 2026', type: 'update', title: 'Updated BCPS Brand Color Palette', body: 'The official BCPS brand guide has been updated with refreshed color values. Download the latest brand assets from the resources section.' },
                ].map(u => (
                  <div key={u.title} className={`wcm-update-card ${u.type}`}>
                    <div className="wcm-update-meta">
                      <span className={`wcm-update-badge ${u.type}`}>{u.type === 'alert' ? '⚠ Alert' : u.type === 'update' ? '🔄 Update' : '💡 Tip'}</span>
                      <span className="wcm-update-date">{u.date}</span>
                    </div>
                    <strong className="wcm-update-title">{u.title}</strong>
                    <p>{u.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── DEPARTMENT PORTAL ───────────────────────────────── */
function DepartmentPortal({ onBack }: { onBack: () => void }) {
  const [activeSection, setActiveSection] = useState('overview')

  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'audit', label: 'Audit Resources' },
    { id: 'templates', label: 'Layout Templates' },
    { id: 'training', label: 'Training Materials' },
    { id: 'compliance', label: 'Compliance' },
  ]

  return (
    <div className="wcm-portal-page">
      <button className="wcm-back-btn" onClick={onBack}>← WCM Community Hub</button>

      <div className="wcm-portal-hero dept-hero">
        <div>
          <h2>Department WCMS Portal</h2>
          <p>Resources for managing and maintaining BCPS department websites.</p>
        </div>
        <div className="wcm-portal-hero-badge dept">Department Web Managers</div>
      </div>

      <div className="wcm-portal-layout">
        <nav className="wcm-subnav">
          {sections.map(s => (
            <button
              key={s.id}
              className={`wcm-subnav-btn${activeSection === s.id ? ' active' : ''}`}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="wcm-portal-content">
          {activeSection === 'overview' && (
            <div className="wcm-content-section">
              <h3>Department Portal Overview</h3>
              <p className="wcm-section-intro">This portal supports BCPS department web managers in maintaining accurate, accessible, and consistent department websites across the district.</p>
              <div className="wcm-overview-cards">
                {[
                  { icon: '🔍', title: 'Audit Resources', desc: 'Checklists and tools to audit your department pages for accuracy, accessibility, and compliance.', section: 'audit' },
                  { icon: '📐', title: 'Layout Templates', desc: 'Approved page templates for common department content types — staff pages, program info, and more.', section: 'templates' },
                  { icon: '🎓', title: 'Training Materials', desc: 'On-demand training videos, slide decks, and reference guides for department content managers.', section: 'training' },
                  { icon: '✅', title: 'Compliance Guidelines', desc: 'Legal and policy requirements all department pages must meet, including FERPA and ADA standards.', section: 'compliance' },
                ].map(c => (
                  <button key={c.title} className="wcm-overview-card" onClick={() => setActiveSection(c.section)}>
                    <div className="wcm-ov-icon">{c.icon}</div>
                    <div>
                      <strong>{c.title}</strong>
                      <p>{c.desc}</p>
                    </div>
                    <span className="wcm-ov-arrow">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'audit' && (
            <div className="wcm-content-section">
              <h3>Audit Resources</h3>
              <p className="wcm-section-intro">Use these tools to review your department pages for accuracy, accessibility, and alignment with district standards.</p>
              <div className="wcm-audit-grid">
                {[
                  { title: 'Annual Content Audit Checklist', desc: 'Complete this checklist every year to ensure all department content is current and accurate.', status: 'Due Apr 30' },
                  { title: 'Accessibility Audit Template', desc: 'Step-by-step checklist for reviewing ADA compliance on all department pages.' , status: 'Available' },
                  { title: 'Broken Links Report', desc: 'Run this automated report to identify and fix broken links across your department site.', status: 'Live Tool' },
                  { title: 'Outdated Content Tracker', desc: 'Spreadsheet template to track pages that need updating with assigned owners and due dates.', status: 'Template' },
                  { title: 'PDF Accessibility Checker', desc: 'Upload PDFs to check and repair accessibility issues before publishing.', status: 'Live Tool' },
                  { title: 'Readability Score Tool', desc: 'Evaluate the reading level of your content against the BCPS plain-language standard.', status: 'Live Tool' },
                ].map(a => (
                  <div key={a.title} className="wcm-audit-card">
                    <div className="wcm-audit-top">
                      <strong>{a.title}</strong>
                      <span className={`wcm-audit-status ${a.status === 'Due Apr 30' ? 'urgent' : a.status === 'Live Tool' ? 'live' : 'default'}`}>{a.status}</span>
                    </div>
                    <p>{a.desc}</p>
                    <button className="wcm-audit-btn">Open →</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'templates' && (
            <div className="wcm-content-section">
              <h3>Layout Templates</h3>
              <p className="wcm-section-intro">Approved Finalsite page templates for department use. Use these to ensure your pages are on-brand and accessible.</p>
              <div className="wcm-template-list">
                {[
                  { name: 'Department Homepage', desc: 'Full-width hero, quick links, news feed, and contact block.', pages: 1, tag: 'Required' },
                  { name: 'Program or Service Page', desc: 'Two-column layout for program descriptions, contacts, and resources.', pages: 1, tag: 'Standard' },
                  { name: 'Staff Directory Page', desc: 'Filterable staff listing with photo, title, and contact fields.', pages: 1, tag: 'Standard' },
                  { name: 'Resources & Downloads Page', desc: 'Categorized document library with search and filter functionality.', pages: 1, tag: 'Standard' },
                  { name: 'News & Announcements', desc: 'Automatically populated news feed with category filtering.', pages: 1, tag: 'Standard' },
                  { name: 'Event & Calendar Page', desc: 'Embedded calendar with event detail pages.', pages: 2, tag: 'Advanced' },
                  { name: 'Multi-Page Program Site', desc: 'Full sub-site template for larger programs with navigation.', pages: 5, tag: 'Advanced' },
                ].map(t => (
                  <div key={t.name} className="wcm-template-row">
                    <div className="wcm-template-thumb">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    </div>
                    <div className="wcm-template-info">
                      <strong>{t.name}</strong>
                      <span>{t.desc}</span>
                      <span className="wcm-template-pages">{t.pages} page{t.pages > 1 ? 's' : ''}</span>
                    </div>
                    <span className={`wcm-template-tag ${t.tag.toLowerCase()}`}>{t.tag}</span>
                    <button className="wcm-template-btn">Use Template</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'training' && (
            <div className="wcm-content-section">
              <h3>Training Materials</h3>
              <p className="wcm-section-intro">On-demand videos, slide decks, and reference materials for department WCMs.</p>
              <div className="wcm-training-categories">
                {[
                  {
                    category: 'Video Training',
                    icon: '🎬',
                    items: ['Intro to Finalsite for Department WCMs (22 min)', 'Managing Your Department Homepage (14 min)', 'Working with Forms and Surveys (18 min)', 'Accessibility in Your Content (11 min)'],
                  },
                  {
                    category: 'Slide Decks',
                    icon: '📊',
                    items: ['WCM Onboarding Presentation', 'Spring 2026 Platform Updates', 'ADA Compliance Workshop Slides', 'Content Strategy for Departments'],
                  },
                  {
                    category: 'Reference Guides',
                    icon: '📖',
                    items: ['Department WCM Quick Reference Card', 'Finalsite Keyboard Shortcuts', 'BCPS Style Guide for Web', 'Image Sizing Cheat Sheet'],
                  },
                ].map(cat => (
                  <div key={cat.category} className="wcm-training-cat">
                    <h4><span>{cat.icon}</span> {cat.category}</h4>
                    <ul>
                      {cat.items.map(item => (
                        <li key={item}>
                          <button className="wcm-training-item">{item}</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === 'compliance' && (
            <div className="wcm-content-section">
              <h3>Compliance Guidelines</h3>
              <p className="wcm-section-intro">All BCPS department websites must meet these legal and policy requirements.</p>
              <div className="wcm-compliance-list">
                {[
                  {
                    law: 'ADA / Section 508',
                    color: '#1672A7',
                    rules: ['All images must have descriptive alt text', 'Videos must include closed captions', 'PDFs must be tagged and machine-readable', 'Color contrast ratio must meet WCAG 2.1 AA (4.5:1)', 'All forms must be keyboard-navigable'],
                  },
                  {
                    law: 'FERPA',
                    color: '#7B5EA7',
                    rules: ['Never publish student names, photos, or grades without written consent', 'Remove personally identifiable student information from public pages', 'Award and honor roll listings require parent opt-in', 'School directories may not be published publicly'],
                  },
                  {
                    law: 'BCPS Policy',
                    color: '#2E8B57',
                    rules: ['All content must be reviewed and approved by department head', 'External links must be reviewed annually', 'Political content and endorsements are prohibited', 'Copyright-protected materials require written permission', 'Pages must be reviewed and updated at least annually'],
                  },
                ].map(c => (
                  <div key={c.law} className="wcm-compliance-card" style={{ borderLeftColor: c.color }}>
                    <div className="wcm-compliance-header" style={{ color: c.color }}>
                      <strong>{c.law}</strong>
                    </div>
                    <ul>
                      {c.rules.map(r => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── ROOT ────────────────────────────────────────────── */
export default function WCMPage() {
  const [view, setView] = useState<WCMView>('hub')

  if (view === 'school')     return <SchoolPortal onBack={() => setView('hub')} />
  if (view === 'department') return <DepartmentPortal onBack={() => setView('hub')} />
  return <WCMHub onNavigate={setView} />
}
