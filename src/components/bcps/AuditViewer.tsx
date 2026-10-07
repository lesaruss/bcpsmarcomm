'use client'
// AuditViewer: department audit v3 (Sean, 2026-10-06). Left, a screenshot of
// the WCM's own page with numbered pins; right, every standard from the
// certification course as green (pass), red (fix) or amber (review). Click a
// row to see where it is on the page, what it means, how to fix it in
// Finalsite and which course page teaches it. Modeled on the Banner
// Submission validation panel (same chip colors).

import { useMemo, useRef, useState } from 'react'
import { courseHref, type CheckResult, type CheckStatus, type Rect } from '@/lib/dept-standards'

export interface AuditV3 {
  id: string
  audited_at: string
  page_url?: string | null
  checks?: CheckResult[] | null
  checks_passed?: number | null
  checks_failed?: number | null
  checks_review?: number | null
  screenshots?: { desktop?: { url: string; w: number; h: number } | null; mobile?: { url: string; w: number; h: number } | null } | null
  ada_violations?: unknown
}

const CHIP: Record<CheckStatus, { label: string; bg: string; fg: string; dot: string }> = {
  pass:   { label: 'Pass',   bg: '#e6f4ea', fg: '#1e6b3a', dot: '#2e9d52' },
  fail:   { label: 'Fix',    bg: '#fbe9e7', fg: '#a13a2f', dot: '#d0453a' },
  review: { label: 'Review', bg: '#fdf3e0', fg: '#8a5a00', dot: '#e0a21b' },
}
const ORDER: Record<CheckStatus, number> = { fail: 0, review: 1, pass: 2 }
const AREAS = ['Homepage', 'Layout', 'Content', 'Navigation', 'Accessibility'] as const

// note replaces the summary line; showCourse=false hides the course links
// (school audits: the department course is not the schools' standard).
export default function AuditViewer({ audit, note, showCourse = true }: { audit: AuditV3; note?: React.ReactNode; showCourse?: boolean }) {
  const checks = useMemo(() => (Array.isArray(audit.checks) ? audit.checks : []), [audit.checks])
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [active, setActive] = useState<string | null>(null)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Number every red and amber check that has something to point at.
  const numbered = useMemo(() => {
    const m = new Map<string, number>()
    let n = 0
    for (const c of [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status])) {
      if (c.status !== 'pass' && c.targets.some((t) => t.desktop || t.mobile)) m.set(c.id, ++n)
    }
    return m
  }, [checks])

  const passed = audit.checks_passed ?? checks.filter((c) => c.status === 'pass').length
  const failed = audit.checks_failed ?? checks.filter((c) => c.status === 'fail').length
  const review = audit.checks_review ?? checks.filter((c) => c.status === 'review').length
  const finalsiteCount = Array.isArray(audit.ada_violations) ? (audit.ada_violations as { owner?: string }[]).filter((v) => v.owner === 'finalsite').length : 0

  const shot = audit.screenshots?.[view] ?? null
  const rectOf = (r?: Rect | null) => r && natural ? { left: `${(r.x / natural.w) * 100}%`, top: `${(r.y / natural.h) * 100}%`, width: `${(r.w / natural.w) * 100}%`, height: `${(r.h / natural.h) * 100}%` } : null

  const showOnPage = (c: CheckResult) => {
    setActive(c.id)
    const t = c.targets.find((x) => (view === 'desktop' ? x.desktop : x.mobile))
    const r = t ? (view === 'desktop' ? t.desktop : t.mobile) : null
    const el = scroller.current
    const img = el?.querySelector('img')
    if (el && img && r && natural) el.scrollTo({ top: Math.max(0, (r.y / natural.h) * img.clientHeight - 80), behavior: 'smooth' })
  }
  const pick = (c: CheckResult) => {
    if (active === c.id) { setActive(null); return }
    showOnPage(c)
  }
  const pinClick = (id: string) => {
    const c = checks.find((x) => x.id === id)
    if (!c) return
    setFilter('all')
    showOnPage(c)
    setTimeout(() => rowRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
  }

  const visible = checks.filter((c) => filter === 'all' || c.status !== 'pass')

  return (
    <div className="av">
      <style>{CSS}</style>
      <div className="av-summary">
        <div className="av-count"><b>{passed}</b> of {passed + failed} checks pass</div>
        <span className="av-chip" style={{ background: CHIP.fail.bg, color: CHIP.fail.fg }}>{failed} to fix</span>
        <span className="av-chip" style={{ background: CHIP.review.bg, color: CHIP.review.fg }}>{review} to review</span>
        <span className="av-chip" style={{ background: CHIP.pass.bg, color: CHIP.pass.fg }}>{passed} passed</span>
        <div style={{ flex: 1 }} />
        <span className="av-note">{note ?? <>Every check is a standard from the <a href="/certification/departments">WCM certification course</a>. Amber items need you to look; they do not change your score.</>}</span>
      </div>

      <div className="av-grid">
        <section className="av-page" aria-label="Your page">
          <div className="av-page-head">
            <span className="av-h">Your page</span>
            <div className="av-toggle" role="group" aria-label="Screen size">
              {(['desktop', 'mobile'] as const).map((v) => (
                <button key={v} type="button" className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => { setNatural(null); setView(v) }}>{v === 'desktop' ? 'Desktop' : 'Phone'}</button>
              ))}
            </div>
          </div>
          {audit.page_url && <a className="av-url" href={audit.page_url} target="_blank" rel="noopener">{audit.page_url.replace(/^https?:\/\/(www\.)?/, '')}</a>}
          <div className={`av-scroll ${view}`} ref={scroller}>
            {shot ? (
              <div className="av-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot.url} alt={`Screenshot of the audited page, ${view === 'desktop' ? 'desktop' : 'phone'} width`} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
                {natural && checks.map((c) => {
                  const num = numbered.get(c.id)
                  if (!num) return null
                  return c.targets.map((t, i) => {
                    const box = rectOf(view === 'desktop' ? t.desktop : t.mobile)
                    if (!box) return null
                    const on = active === c.id
                    return (
                      <div key={`${c.id}-${i}`}>
                        {on && <div className="av-box" style={{ ...box, borderColor: CHIP[c.status].dot }} />}
                        {(i === 0 || on) && (
                          <button type="button" className={`av-pin${on ? ' on' : ''}`} style={{ left: box.left, top: box.top, background: CHIP[c.status].dot }} onClick={() => pinClick(c.id)} aria-label={`${num}: ${c.title}`} title={`${num}. ${c.title}${t.label ? ` (${t.label})` : ''}`}>{num}</button>
                        )}
                      </div>
                    )
                  })
                })}
              </div>
            ) : <div className="av-empty">No screenshot was saved for this audit.</div>}
          </div>
        </section>

        <section className="av-list" aria-label="Checks">
          <div className="av-page-head">
            <span className="av-h">Checks</span>
            <div className="av-toggle" role="group" aria-label="Show">
              <button type="button" className={filter === 'open' ? 'on' : ''} aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>To do ({failed + review})</button>
              <button type="button" className={filter === 'all' ? 'on' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({checks.length})</button>
            </div>
          </div>
          {visible.length === 0 && <div className="av-empty">Nothing to fix or review. Every check passes.</div>}
          {AREAS.map((area) => {
            const rows = visible.filter((c) => c.area === area).sort((a, b) => ORDER[a.status] - ORDER[b.status])
            if (!rows.length) return null
            return (
              <div key={area} className="av-area">
                <div className="av-area-h">{area}</div>
                {rows.map((c) => {
                  const chip = CHIP[c.status]
                  const open = active === c.id
                  const num = numbered.get(c.id)
                  return (
                    <div key={c.id} ref={(el) => { rowRefs.current[c.id] = el }} className={`av-row${open ? ' open' : ''}`}>
                      <button type="button" className="av-row-head" onClick={() => pick(c)} aria-expanded={open}>
                        <span className="av-num" style={{ background: num ? chip.dot : 'transparent', color: num ? '#fff' : chip.dot, border: num ? 'none' : `2px solid ${chip.dot}` }}>{num ?? (c.status === 'pass' ? '✓' : c.status === 'fail' ? '!' : '?')}</span>
                        <span className="av-row-text">
                          <span className="av-row-title">{c.title}</span>
                          <span className="av-row-detail">{c.detail}</span>
                        </span>
                        <span className="av-chip" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                      </button>
                      {open && (
                        <div className="av-row-body">
                          {c.items && c.items.length > 0 && (
                            <><div className="av-lbl">On your page</div><ul className="av-items">{c.items.slice(0, 12).map((it, i) => <li key={i}>{it}</li>)}</ul></>
                          )}
                          {c.why && <><div className="av-lbl">Why it matters</div><p>{c.why}</p></>}
                          {c.status !== 'pass' && c.steps.length > 0 && (
                            <><div className="av-lbl">{c.status === 'review' ? 'What to check' : 'How to fix it in Finalsite'}</div><ol>{c.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>
                          )}
                          {showCourse && <a className="av-course" href={courseHref(c.course)}>Learn it in the course: {c.course.label} &rarr;</a>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {finalsiteCount > 0 && (
            <div className="av-finalsite">
              <b>Not yours to fix:</b> the scan also found {finalsiteCount} accessibility issue{finalsiteCount === 1 ? '' : 's'} in the site header, menus or footer. Those belong to Finalsite, are reported to them every month, and never count against your page.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

const CSS = `
.av{margin-bottom:20px}
.av-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:12px 16px;margin-bottom:12px}
.av-count{font-size:14px;color:var(--lr-text,#1a1a1a);margin-right:6px}.av-count b{font-size:22px;font-weight:900}
.av-chip{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;white-space:nowrap}
.av-note{font-size:11.5px;color:var(--lr-text-50,rgba(26,26,26,.6));max-width:440px;line-height:1.45}.av-note a{color:#1672A7;font-weight:700}
.av-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:980px){.av-grid{grid-template-columns:1fr}}
.av-page,.av-list{background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:12px 14px}
.av-page{position:sticky;top:12px}
@media (max-width:980px){.av-page{position:static}.av-scroll{height:55vh}}
.av-page-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.av-h{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#1672A7}
.av-toggle{display:inline-flex;border:1px solid var(--lr-border,rgba(0,0,0,.12));border-radius:8px;overflow:hidden}
.av-toggle button{border:0;background:#fff;font:inherit;font-size:11.5px;font-weight:700;padding:5px 10px;cursor:pointer;color:var(--lr-text-50,#555)}
.av-toggle button.on{background:#1672A7;color:#fff}
.av-url{display:block;font-size:11px;color:var(--lr-text-50,#666);margin-bottom:8px;word-break:break-all}
.av-scroll{height:72vh;overflow:auto;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:8px;background:#f3f4f6}
.av-scroll.mobile .av-canvas{max-width:390px;margin:0 auto}
.av-canvas{position:relative}
.av-canvas img{display:block;width:100%;height:auto}
.av-pin{position:absolute;transform:translate(-40%,-40%);width:24px;height:24px;border-radius:50%;border:2px solid #fff;color:#fff;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:0;z-index:2}
.av-pin.on{width:30px;height:30px;font-size:13px;z-index:3}
.av-box{position:absolute;border:3px solid;border-radius:4px;background:rgba(255,255,255,.08);box-shadow:0 0 0 9999px rgba(0,0,0,.18);pointer-events:none;z-index:1}
.av-empty{padding:28px 12px;text-align:center;font-size:13px;color:var(--lr-text-50,#666)}
.av-area{margin-top:6px}
.av-area-h{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.16em;color:var(--lr-text-50,#777);margin:10px 0 4px}
.av-row{border:1px solid var(--lr-border,rgba(0,0,0,.08));border-radius:8px;margin-bottom:6px;overflow:hidden}
.av-row.open{border-color:#1672A7}
.av-row-head{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;background:#fff;border:0;padding:10px 12px;cursor:pointer;font:inherit}
.av-row-head:hover{background:#f8fafb}
.av-num{flex-shrink:0;width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:1px}
.av-row-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.av-row-title{font-size:13px;font-weight:800;color:var(--lr-text,#1a1a1a);line-height:1.35}
.av-row-detail{font-size:12px;color:var(--lr-text-75,rgba(26,26,26,.75));line-height:1.45}
.av-row-body{padding:2px 14px 12px 44px;font-size:12.5px;color:var(--lr-text-75,#333);line-height:1.55}
.av-row-body p{margin:0 0 6px}.av-row-body ol{margin:0 0 6px 0;padding-left:18px}.av-row-body li{margin-bottom:3px}
.av-lbl{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.16em;color:var(--lr-text-50,#777);margin:8px 0 3px}
.av-items{margin:0 0 4px 0;padding-left:18px;font-size:12px;word-break:break-word}
.av-course{display:inline-block;margin-top:6px;font-size:12px;font-weight:800;color:#1672A7;text-decoration:none}
.av-course:hover{text-decoration:underline}
.av-finalsite{margin-top:12px;font-size:12px;line-height:1.5;color:var(--lr-text-75,#444);background:#f8fafb;border-radius:8px;padding:10px 12px}
`
