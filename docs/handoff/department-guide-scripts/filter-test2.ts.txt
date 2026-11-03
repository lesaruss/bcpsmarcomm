import { readFileSync } from 'node:fs'
import { filterGuide } from '/home/user/bcpsmarcomm/src/lib/guides/audience'
import type { GuideAudience, GuideDef } from '/home/user/bcpsmarcomm/src/lib/guides/types'

const def = JSON.parse(readFileSync('/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/def-v3.json', 'utf8')) as GuideDef
type Case = { label: string; viewer: 'all' | Set<GuideAudience>; tabs: string[]; tiles: string[]; wcm: boolean; director: boolean }
const S = (...a: GuideAudience[]) => new Set<GuideAudience>(a)
const cases: Case[] = [
  { label: 'admin', viewer: 'all', tabs: ['widgets', 'website', 'audit', 'analytics', 'reference'], tiles: ['quick', 'wcm-tools', 'director-tools'], wcm: true, director: true },
  { label: 'staff', viewer: S(), tabs: ['widgets', 'reference'], tiles: ['quick'], wcm: false, director: false },
  { label: 'wcm', viewer: S('wcm'), tabs: ['widgets', 'website', 'audit', 'analytics', 'reference'], tiles: ['quick', 'wcm-tools'], wcm: true, director: false },
  { label: 'director', viewer: S('director'), tabs: ['widgets', 'analytics', 'reference'], tiles: ['quick', 'director-tools'], wcm: false, director: true },
  { label: 'wcm+director', viewer: S('wcm', 'director'), tabs: ['widgets', 'website', 'audit', 'analytics', 'reference'], tiles: ['quick', 'wcm-tools', 'director-tools'], wcm: true, director: true },
]

let failed = 0
const check = (name: string, pass: boolean, detail = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')) }

for (const c of cases) {
  const f = filterGuide(def, c.viewer)
  const text = JSON.stringify(f)
  const tabs = f.tabs.map((t) => t.id)
  const over = f.overview ?? []
  const tiles = over.filter((s) => s.layout === 'tile').map((s) => s.id)
  check(`${c.label}: tabs ${c.tabs.join('/')}`, JSON.stringify(tabs) === JSON.stringify(c.tabs), tabs.join('/'))
  check(`${c.label}: tiles ${c.tiles.join('/')}`, JSON.stringify(tiles) === JSON.stringify(c.tiles), tiles.join('/'))
  check(`${c.label}: one hero, help stays wide`, over.filter((s) => s.layout === 'hero').length === 1 && over.some((s) => s.id === 'help' && s.layout === 'wide'))
  check(`${c.label}: audit/Finalsite/Hot Lab ${c.wcm ? 'present' : 'absent'}`, ['Run Audit', 'fs/admin', 'meet/264785803068551'].every((k) => text.includes(k) === c.wcm))
  check(`${c.label}: director links ${c.director ? 'present' : 'absent'}`, text.includes('director-department') === c.director)
  const steps = f.tabs.filter((t) => t.step).map((t) => t.step)
  check(`${c.label}: steps without gaps`, steps.every((s, i) => s === i + 1), steps.join(','))
}
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed')
process.exit(failed ? 1 : 0)
