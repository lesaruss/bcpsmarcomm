'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const GROUPS = [
  { id: '1b815c37-490e-4559-bf97-e1548bb97f1a', slug: 'ooc', name: 'OOC (Office of Communications)' },
  { id: '616a67cb-cdc4-4b05-84aa-f5c8a48036f9', slug: 'dwt', name: 'DWT (District Web Team)' },
  { id: '8454d61f-af8b-486f-a25d-37af7f1ec0a0', slug: 'superadmin', name: 'SuperAdmin' }
]

const PAGES = [
  // OOC/DWT restricted
  { slug: 'marcomm', name: 'MarComm Console', restrictedTo: ['ooc', 'dwt'] },
  { slug: 'graphics', name: 'Graphics', restrictedTo: ['ooc'] },
  { slug: 'minutes', name: 'Minutes', restrictedTo: ['ooc', 'dwt'] },
  { slug: 'reports', name: 'Reports', restrictedTo: ['ooc', 'dwt'] },
  { slug: 'wcm', name: 'WCM Portal', restrictedTo: ['dwt'] },
  // SuperAdmin only
  { slug: 'superadmin', name: 'SuperAdmin Console', restrictedTo: ['superadmin'] },
  { slug: 'permissions', name: 'Permissions', restrictedTo: ['superadmin'] },
  // Everyone else = open access (no restriction)
]

const DOCUMENTS = [
  { slug: 'appas-self-eval', name: 'APPAS Self-Evaluation', specialAccess: 'sean-farrah' },
  { slug: 'appas-evaluation', name: 'APPAS Evaluation', specialAccess: 'sean-farrah' },
]

const USERS = [
  { id: '04faac9c-bb37-406e-ae16-0c347e2aa55c', name: 'Vanessa Deslandes', email: 'vanessa.deslandes@browardschools.com', group: null },
  { id: '5e17d08d-aa9d-499d-99d6-41ead37a7b41', name: 'Yaco Abuelafia', email: 'yaco.abuelafia@browardschools.com', group: null },
  { id: '79009b0b-e963-40a0-8857-dc3f23a809a6', name: 'Rodolfo Carril', email: 'rodolfo.carril@browardschools.com', group: null },
  { id: 'a390ff47-562a-484a-9295-2d1e7ddcf7db', name: 'Tricia Allen', email: 'tricia.allen@browardschools.com', group: null },
  { id: 'de7d9477-5a83-422f-b381-ca8734a1d6da', name: 'Felicia Hicks', email: 'felicia.hicks@browardschools.com', group: null },
]

const SPECIAL_USERS = [
  { name: 'Sean Russell', email: 'contact@lesaruss.com', id: '12404ad5-3e28-457b-9439-992eaaecf01d', hasAppasAccess: true },
  { name: 'Farrah Wilson', email: 'farrah.wilson@browardschools.com', id: null, hasAppasAccess: true, note: 'Account creation pending' },
]

export default function PermissionsPanel() {
  const [pagePerms, setPagePerms] = useState<any[]>([])
  const [docPerms, setDocPerms] = useState<any[]>([])
  const [userGroups, setUserGroups] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: pageData } = await supabase.from('bcps_page_permissions').select('*')
    const { data: docData } = await supabase.from('bcps_document_permissions').select('*')
    const { data: ugData } = await supabase.from('bcps_user_groups').select('*')
    setPagePerms(pageData || [])
    setDocPerms(docData || [])
    setUserGroups(ugData || [])
  }

  async function togglePageAccess(pageSlug: string, groupId: string) {
    const supabase = createClient()
    const exists = pagePerms.some(p => p.page_slug === pageSlug && p.group_id === groupId)

    if (exists) {
      await supabase.from('bcps_page_permissions').delete().eq('page_slug', pageSlug).eq('group_id', groupId)
    } else {
      await supabase.from('bcps_page_permissions').insert({ page_slug: pageSlug, group_id: groupId })
    }
    load()
  }

  async function toggleDocAccess(docSlug: string, groupId: string) {
    const supabase = createClient()
    const exists = docPerms.some(p => p.document_slug === docSlug && p.group_id === groupId)

    if (exists) {
      await supabase.from('bcps_document_permissions').delete().eq('document_slug', docSlug).eq('group_id', groupId)
    } else {
      await supabase.from('bcps_document_permissions').insert({ document_slug: docSlug, group_id: groupId })
    }
    load()
  }

  async function toggleUser(userId: string, groupId: string) {
    const supabase = createClient()
    const exists = userGroups.some(ug => ug.user_id === userId && ug.group_id === groupId)

    if (exists) {
      await supabase.from('bcps_user_groups').delete().eq('user_id', userId).eq('group_id', groupId)
    } else {
      await supabase.from('bcps_user_groups').insert({ user_id: userId, group_id: groupId })
    }
    load()
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px', textTransform: 'uppercase' }}>Permissions</h1>
      <p style={{ fontSize: '13px', color: '#666', marginBottom: '32px' }}>Manage page and document access by user group</p>

      {/* USER TO GROUP ASSIGNMENT */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', color: '#1672A7' }}>Assign BCPS Staff to Groups</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {USERS.map(user => (
            <div key={user.id} style={{ padding: '12px', border: '1px solid #e4e4e4', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>{user.name}</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {GROUPS.map(g => {
                  const isAssigned = userGroups.some(ug => ug.user_id === user.id && ug.group_id === g.id)
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleUser(user.id, g.id)}
                      style={{
                        padding: '4px 8px',
                        border: isAssigned ? '2px solid #1672A7' : '1px solid #e4e4e4',
                        background: isAssigned ? '#1672A7' : '#fff',
                        color: isAssigned ? '#fff' : '#000',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      {isAssigned ? '✓ ' : ''}{g.slug.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SPECIAL USERS WITH APPAS ACCESS */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', color: '#F69820' }}>Special Access (APPAS Documents)</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {SPECIAL_USERS.map(user => (
            <div key={user.email} style={{ padding: '12px', border: '1px solid #ffd9b3', borderRadius: '8px', background: '#fffaf5' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                {user.name}
                {user.note && <span style={{ fontSize: '10px', color: '#999', marginLeft: '8px' }}>({user.note})</span>}
              </div>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px' }}>{user.email}</div>
              <div style={{ fontSize: '10px', fontStyle: 'italic', color: '#F69820' }}>
                ✓ APPAS Self-Evaluation & APPAS Evaluation access
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PAGE ACCESS BY GROUP */}
      <div style={{ marginBottom: '48px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', color: '#1672A7' }}>Page Access by Group</h2>
        <div style={{ display: 'grid', gap: '8px' }}>
          {PAGES.map(page => (
            <div key={page.slug} style={{ padding: '12px', border: '1px solid #e4e4e4', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{page.name}</div>
              <div style={{ fontSize: '10px', color: '#999', marginBottom: '8px' }}>
                {page.restrictedTo.length === 0 ? 'Open to everyone' : `Restricted to: ${page.restrictedTo.join(', ')}`}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {GROUPS.map(g => {
                  const hasAccess = pagePerms.some(p => p.page_slug === page.slug && p.group_id === g.id)
                  const isRestricted = page.restrictedTo.includes(g.slug)
                  return (
                    <button
                      key={g.id}
                      onClick={() => togglePageAccess(page.slug, g.id)}
                      style={{
                        padding: '4px 8px',
                        border: hasAccess ? '2px solid #16750C' : '1px solid #e4e4e4',
                        background: hasAccess ? '#16750C' : isRestricted ? '#f0f0f0' : '#fff',
                        color: hasAccess ? '#fff' : '#000',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                        opacity: isRestricted && !hasAccess ? 0.5 : 1,
                      }}
                      title={isRestricted ? `Default for ${g.slug}` : ''}
                    >
                      {hasAccess ? '✓ ' : ''}{g.slug.toUpperCase()}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
