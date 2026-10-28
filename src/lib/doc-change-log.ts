import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// The change trail (BCPS Document System, Phase 3, V 2026-10-28): "Every
// automatic change leaves a trail: who triggered it, the source file and
// line, the AI model, before and after, whether it was auto-applied or
// approved and by whom, and anything the reviewer unticked." One row in
// bcps_doc_change_log per change made through the platform. The content
// before is the revision (bcps_doc_revisions) the change already writes; the
// content after is identified by its md5. Logging never blocks the change.

export type ChangeAction =
  | 'transcript_update' | 'meeting_notes' | 'turn_in' | 'deliverable_added'
  | 'input_added' | 'input_accepted' | 'input_dismissed' | 'agenda_saved' | 'agenda_outcomes'
  | 'page_edited' | 'leads_changed'

export interface ChangeEntry {
  slug: string
  action: ChangeAction
  actor: string
  approvedBy?: string | null
  autoApplied?: boolean
  model?: string | null
  source?: Record<string, unknown>
  summary: string
  unticked?: unknown[]
  revisionId?: string | null
  after?: string | null
}

export const md5 = (s: string) => createHash('md5').update(s).digest('hex')

export async function logChange(svc: SupabaseClient, e: ChangeEntry): Promise<void> {
  try {
    await svc.from('bcps_doc_change_log').insert({
      slug: e.slug,
      action: e.action,
      actor_email: e.actor,
      approved_by_email: e.approvedBy ?? null,
      auto_applied: !!e.autoApplied,
      model: e.model ?? null,
      source: e.source ?? {},
      summary: e.summary.slice(0, 2000),
      unticked: e.unticked ?? [],
      revision_id: e.revisionId ?? null,
      after_md5: e.after ? md5(e.after) : null,
    })
  } catch (err) {
    console.error('doc-change-log: could not record a change', err)
  }
}
