// lib/ada-owner-overrides.ts
//
// Client-side helper for the admin owner-override layer (see
// app/api/bcps/ada-owner-overrides/route.ts for why this exists). Every
// page that renders scan findings by owner (ADAManagerPage, AdaScannerPage,
// the school-portal scanner) resolves a finding's owner through
// resolveOwner() instead of reading entry.owner directly, so a
// reclassification made anywhere shows up everywhere.

import type { GlossaryEntry, GlossaryOwner } from './ada-glossary'

export type OwnerOverrideMap = Record<string, GlossaryOwner>

/**
 * The owner to actually use for a finding: an admin override on the
 * glossary entry's key, if one exists, otherwise the glossary's own
 * default. A finding with no glossary entry at all has no key to override
 * on and falls back to 'depends' - uncatalogued findings count the same as
 * an unresolved depends case until someone writes a glossary entry for
 * them.
 */
export function resolveOwner(entry: GlossaryEntry | null, overrides: OwnerOverrideMap): GlossaryOwner {
  if (entry && overrides[entry.key]) return overrides[entry.key]
  if (entry) return entry.owner
  return 'depends'
}

export async function fetchOwnerOverrides(token: string): Promise<OwnerOverrideMap> {
  const r = await fetch('/api/bcps/ada-owner-overrides', { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return {}
  const j = await r.json()
  return (j.overrides ?? {}) as OwnerOverrideMap
}

export async function setOwnerOverride(token: string, glossaryKey: string, owner: GlossaryOwner): Promise<OwnerOverrideMap> {
  const r = await fetch('/api/bcps/ada-owner-overrides', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ glossary_key: glossaryKey, owner }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Could not save override.')
  return (j.overrides ?? {}) as OwnerOverrideMap
}
