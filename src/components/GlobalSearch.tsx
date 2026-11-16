'use client'

// The topbar search (Sean, 2026-11-16: "I was trying to search for members
// in the search, and it didn't do anything"). It was a bare input with
// nothing behind it. It now finds, as you type:
//   - Members, by name, email, title, department or division, for anyone
//     whose page set includes Members (the same grant the Members page uses;
//     /api/bcps/members is read only when that holds). Opens the profile.
//   - Departments, by name or division. Opens the department page.
//   - Tools the person can open, by the same rule as My Resources.
// Data loads on first focus, not on every page view.

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { TOOLS, type Tool } from '@/lib/bcps-tools'
import { MARCOMM_PATH, type PageId } from '@/lib/types'
import { SUPERADMIN_PAGES_SET } from '@/lib/superadmin-pages'

type MemberHit = { user_id: string; name: string; email: string; title: string | null; department: { name: string; division: string | null } | null; href?: string }
type DeptHit = { id: string; name: string; division: string | null }
type Result = { key: string; group: 'Members' | 'Departments' | 'Tools'; title: string; sub: string; go: () => void }

const PER_GROUP = 6

export default function GlobalSearch({ pages, isSuperadmin, onNavigate }: {
  pages: string[] | null
  isSuperadmin: boolean
  onNavigate: (page: PageId) => void
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [members, setMembers] = useState<MemberHit[] | null>(null)
  const [depts, setDepts] = useState<DeptHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedFor = useRef<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const canMembers = isSuperadmin || !!pages?.includes('members')

  const load = useCallback(async () => {
    const key = canMembers ? 'm' : 'd'
    if (loadedFor.current === key) return
    loadedFor.current = key
    setLoading(true)
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    await Promise.all([
      supabase.from('bcps_departments').select('id,name,division').order('name')
        .then(({ data }) => setDepts((data ?? []) as DeptHit[])),
      canMembers && token
        ? fetch('/api/bcps/members', { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.ok ? r.json() : { members: [] })
            .then((j) => {
              // School WCMs without a member-role row are only in school_members.
              const seen = new Set((j.members ?? []).map((m: MemberHit) => m.user_id))
              const schools = ((j.school_members ?? []) as { user_id: string; name: string; email: string; schools: { name: string; loc_no: string }[] }[])
                .filter((x) => !seen.has(x.user_id))
                .map((x) => ({ user_id: x.user_id, name: x.name, email: x.email, title: 'School WCM', department: { name: x.schools.map((sc) => sc.name).join(', '), division: 'Schools' },
                  href: x.schools[0] ? `/school?loc=${encodeURIComponent(x.schools[0].loc_no)}` : undefined }))
              setMembers([...(j.members ?? []), ...schools])
            })
            .catch(() => setMembers([]))
        : Promise.resolve(setMembers(null)),
    ])
    setLoading(false)
  }, [canMembers])

  // Close on a click outside.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const canOpenTool = useCallback((t: Tool) => pages
    ? pages.includes(t.gate) || (isSuperadmin && SUPERADMIN_PAGES_SET.has(t.gate))
    : isSuperadmin || !SUPERADMIN_PAGES_SET.has(t.gate), [pages, isSuperadmin])

  const results = useMemo<Result[]>(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return []
    const hit = (text: string) => { const t = text.toLowerCase(); return terms.every((w) => t.includes(w)) }
    const done = () => { setOpen(false); setQ('') }

    const m: Result[] = (members ?? [])
      .filter((x) => hit(`${x.name} ${x.email} ${x.title ?? ''} ${x.department?.name ?? ''} ${x.department?.division ?? ''}`))
      .slice(0, PER_GROUP)
      .map((x) => ({
        key: `m:${x.user_id}`, group: 'Members', title: x.name,
        sub: [x.title, x.department?.name].filter(Boolean).join(' · ') || x.email,
        go: () => { done(); router.push(x.href ?? `/?page=members&member=${x.user_id}`, { scroll: false }) },
      }))
    const d: Result[] = (depts ?? [])
      .filter((x) => hit(`${x.name} ${x.division ?? ''}`))
      .slice(0, PER_GROUP)
      .map((x) => ({
        key: `d:${x.id}`, group: 'Departments', title: x.name, sub: x.division ?? 'Department',
        go: () => { done(); router.push(`/department?id=${x.id}`) },
      }))
    const t: Result[] = TOOLS.filter(canOpenTool)
      .filter((x) => hit(`${x.label} ${x.desc} ${x.group}`))
      .slice(0, PER_GROUP)
      .map((x) => ({
        key: `t:${x.label}`, group: 'Tools', title: x.label, sub: x.desc,
        go: () => {
          done()
          if (x.page === 'marcomm-assignments') router.push(MARCOMM_PATH)
          else if (x.page) onNavigate(x.page)
          else if (x.href) window.location.href = x.href
        },
      }))
    return [...m, ...d, ...t]
  }, [q, members, depts, canOpenTool, router, onNavigate])

  useEffect(() => { setActive(0) }, [q])

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); (e.target as HTMLInputElement).blur(); return }
    if (!results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length) }
    else if (e.key === 'Enter') { e.preventDefault(); results[active]?.go() }
  }

  const showPanel = open && q.trim().length > 0
  let lastGroup = ''

  return (
    <div className="topbar-search" ref={boxRef}>
      <input
        type="search"
        placeholder={canMembers ? 'Search members, departments, tools' : 'Search departments and tools'}
        className="search-input"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); load() }}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-autocomplete="list"
        aria-label="Search"
        aria-activedescendant={showPanel && results[active] ? `gs-${results[active].key}` : undefined}
      />
      {showPanel && (
        <div className="gsearch-panel" id="global-search-results" role="listbox">
          {results.length === 0 && (
            <div className="gsearch-empty">{loading ? 'Searching…' : `Nothing matches “${q.trim()}”.`}</div>
          )}
          {results.map((r, i) => {
            const head = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            return (
              <div key={r.key}>
                {head && <div className="gsearch-group">{head}</div>}
                <button
                  type="button"
                  id={`gs-${r.key}`}
                  role="option"
                  aria-selected={i === active}
                  className={`gsearch-item${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={r.go}
                >
                  <span className="gsearch-title">{r.title}</span>
                  <span className="gsearch-sub">{r.sub}</span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
