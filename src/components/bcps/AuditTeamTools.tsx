'use client'
// The District Web Team's view of the audit (Sean, 2026-11-05). The audit is a
// component inside each hub, with a view per role, not a hub of its own. WCMs
// and directors already have theirs; this is the team's: the still-stuck
// questions WCMs send from an audit item, the rule review, and the rules only
// Finalsite can fix, at the top of the Run Audit tab in the SuperAdmin and
// District Web Team homes. Shown to admins and anyone with the
// 'audit-rules-review' page grant; each card hides itself if its API refuses.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

type Counts = {
  questions: { open: number; total: number } | null
  rules: { total: number; decided: number; finalsite: number } | null
}

export default function AuditTeamTools() {
  const [c, setC] = useState<Counts | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      const headers = await authHeaders()
      const [q, r] = await Promise.all([
        fetch('/api/bcps/audit-questions?all=1', { headers }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        fetch('/api/bcps/audit-rule-review', { headers }).then((x) => (x.ok ? x.json() : null)).catch(() => null),
      ])
      if (!live) return
      const qs = (q?.questions ?? null) as { status: string }[] | null
      const rules = (r?.rules ?? null) as { id: string }[] | null
      const reviews = (r?.reviews ?? []) as { check_id: string }[]
      const decided = new Set(reviews.map((x) => x.check_id))
      setC({
        questions: qs ? { open: qs.filter((x) => x.status === 'open').length, total: qs.length } : null,
        rules: rules ? { total: rules.length, decided: rules.filter((x) => decided.has(x.id)).length, finalsite: (r?.finalsite ?? []).length } : null,
      })
    })()
    return () => { live = false }
  }, [])

  if (!c || (!c.questions && !c.rules)) return null
  return (
    <div className="home-section">
      <h3 className="home-grp">Audit team tools</h3>
      <div className="home-dept-grid">
        {c.questions && (
          <div className="home-dept">
            <div className="home-dept-head"><h3>Still stuck questions</h3></div>
            <p className="home-card-text">
              <b>{c.questions.open}</b> open{c.questions.open === 1 ? ' question' : ' questions'} from WCMs, sent from an audit item. Answer one and it shows under that item for every WCM.
            </p>
            <a className="wcm-hub2-card-btn" href="/audit-questions">Open the question queue</a>
          </div>
        )}
        {c.rules && (
          <div className="home-dept">
            <div className="home-dept-head"><h3>Audit rule review</h3></div>
            <p className="home-card-text">
              <b>{c.rules.decided}</b> of {c.rules.total} rules have a decision. Keep a rule, change it, or drop it; the audit settings are updated from these decisions.
            </p>
            <a className="wcm-hub2-card-btn" href="/audit-rules-review">Open the rule review</a>
          </div>
        )}
        {c.rules && (
          <div className="home-dept">
            <div className="home-dept-head"><h3>Finalsite items</h3></div>
            <p className="home-card-text">
              <b>{c.rules.finalsite}</b> {c.rules.finalsite === 1 ? 'rule flags' : 'rules flag'} things only Finalsite can fix. These stay off WCM lists and belong with the District Web Team.
            </p>
            <a className="wcm-hub2-card-btn" href="/audit-rules-review?view=finalsite">Open the Finalsite items</a>
          </div>
        )}
      </div>
    </div>
  )
}
