'use client'

// Project cards and the owner-grouped to-do list (Sean, 2026-11-16, from the
// BOSS on sorting the District Web Team Guide's school side). One shape for
// every project, the essentials first and the details one click away, so a
// reader is never handed a wall of text (W3C COGA: clear sections, manageable
// chunks, a consistent structure; NN/g: progressive disclosure).

import type { GuideCard, GuideTodo, GuideCardStatus } from '@/lib/guides/types'

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS: Record<GuideCardStatus, { label: string; tone: string }> = {
  live: { label: 'Live', tone: 'ok' },
  pilot: { label: 'In pilot', tone: 'pilot' },
  building: { label: 'Being built', tone: 'build' },
  proposed: { label: 'Proposed', tone: 'plan' },
  planning: { label: 'Planning', tone: 'plan' },
  waiting: { label: 'Waiting', tone: 'wait' },
}

export function CardStatus({ status }: { status: GuideCardStatus }) {
  const s = STATUS[status] ?? STATUS.planning
  return <span className={`gcard-status ${s.tone}`}>{s.label}</span>
}

export function CardFacts({ card }: { card: GuideCard }) {
  return (
    <dl className="gcard-facts">
      {card.lead && <div><dt>Lead</dt><dd>{card.lead}</dd></div>}
      {card.next && <div className="wide"><dt>Next step</dt><dd>{card.next}</dd></div>}
      {card.date && <div><dt>Date</dt><dd>{card.date}</dd></div>}
      <div><dt>Updated</dt><dd>{shortDate(card.updated)}</dd></div>
    </dl>
  )
}

export function TodoList({ todos }: { todos: GuideTodo[] }) {
  const groups = new Map<string, GuideTodo[]>()
  for (const t of todos) {
    const k = t.owner?.trim() || 'No owner yet'
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const order = Array.from(groups.keys()).sort((a, b) => (a === 'No owner yet' ? 1 : b === 'No owner yet' ? -1 : a.localeCompare(b)))
  const bySoonest = (a: GuideTodo, b: GuideTodo) => (a.sort ?? '9999').localeCompare(b.sort ?? '9999')
  return (
    <div className="gtodo">
      {order.map((owner) => (
        <div key={owner} className="gtodo-group">
          <h4 className="gtodo-owner">{owner} <span>{groups.get(owner)!.length}</span></h4>
          <ul>
            {groups.get(owner)!.sort(bySoonest).map((t, i) => (
              <li key={i}>
                <span className="gtodo-text">{t.href ? <a href={t.href}>{t.text}</a> : t.text}</span>
                {t.due && <span className="gtodo-due">{t.due}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export const GUIDE_BLOCKS_CSS = `
.gcard-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.gcard-head .home-card-title { margin: 0; }
.gcard-status { display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: .04em; padding: 3px 10px; border-radius: 100px; white-space: nowrap; }
.gcard-status.ok { background: #e6f6ea; color: #1a7f37; }
.gcard-status.pilot { background: #e8f1f8; color: #0e4e73; }
.gcard-status.build { background: #efe9f8; color: #5b3d8f; }
.gcard-status.plan { background: #f3f4f6; color: #4b5563; }
.gcard-status.wait { background: #fff4d6; color: #8a5a00; }
.gcard-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 18px; margin: 12px 0 0; }
.gcard-facts > div.wide { grid-column: 1 / -1; order: -1; }
.gcard-facts dt { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; margin: 0 0 2px; }
.gcard-facts dd { margin: 0; font-size: 14px; line-height: 1.5; color: #1a1a1a; }
.gcard-more { margin-top: 12px; border-top: 1px solid #eef1f5; padding-top: 8px; }
.gcard-more summary { cursor: pointer; font-size: 13px; font-weight: 800; color: #0e4e73; padding: 4px 0; }
.gcard-more summary:focus-visible { outline: 3px solid #1672A7; outline-offset: 2px; border-radius: 4px; }
.gcard-more[open] summary { margin-bottom: 6px; }
.gtodo { display: grid; gap: 14px; margin-top: 6px; }
.gtodo-owner { font-size: 13px; font-weight: 800; margin: 0 0 6px; color: #1a1a1a; }
.gtodo-owner span { display: inline-block; min-width: 20px; text-align: center; font-size: 11px; background: #e8f1f8; color: #0e4e73; border-radius: 100px; padding: 1px 7px; margin-left: 4px; }
.gtodo ul { list-style: none; margin: 0; padding: 0; border: 1px solid #eef1f5; border-radius: 8px; }
.gtodo li { display: flex; justify-content: space-between; gap: 14px; padding: 9px 12px; font-size: 14px; line-height: 1.45; }
.gtodo li + li { border-top: 1px solid #eef1f5; }
.gtodo-due { flex-shrink: 0; font-size: 12px; font-weight: 700; color: #8a5a00; white-space: nowrap; }
.gtodo-text a { color: #0e4e73; font-weight: 700; }
@media (max-width: 640px) {
  .gcard-facts { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .gtodo li { flex-direction: column; gap: 2px; }
}
`
