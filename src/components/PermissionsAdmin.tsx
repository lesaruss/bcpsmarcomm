'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const GROUPS = [
  { id: '1b815c37-490e-4559-bf97-e1548bb97f1a', slug: 'ooc', name: 'OOC' },
  { id: '616a67cb-cdc4-4b05-84aa-f5c8a48036f9', slug: 'wcm', name: 'WCM' },
  { id: '8454d61f-af8b-486f-a25d-37af7f1ec0a0', slug: 'dwt', name: 'DWT' }
]

const DOCS = [
  { slug: 'website-governance', name: 'Website Governance' },
  { slug: 'google-governance', name: 'Google Governance' },
  { slug: 'appas-self-eval', name: 'APPAS Self-Eval' },
  { slug: 'appas-evaluation', name: 'APPAS Evaluation' },
  { slug: 'implementation-plan', name: 'Implementation Plan' }
]

const USERS = [
  { id: '04faac9c-bb37-406e-ae16-0c347e2aa55c', name: 'Vanessa Deslandes', email: 'vanessa.deslandes@browardschools.com' },
  { id: '5e17d08d-aa9d-499d-99d6-41ead37a7b41', name: 'Yaco Abuelafía', email: 'yaco.abuelafia@browardschools.com' },
  { id: '79009b0b-e963-40a0-8857-dc3f23a809a6', name: 'Rodolfo Carril', email: 'rodolfo.carril@browardschools.com' },
  { id: 'a390ff47-562a-484a-9295-2d1e7ddcf7db', name: 'Tricia Allen', email: 'tricia.allen@browardschools.com' },
  { id: 'de7d9477-5a83-422f-b381-ca8734a1d6da', name: 'Felicia Hicks', email: 'felicia.hicks@browardschools.com' }
]

export default function PermissionsAdmin() {
  const [perms, setPerms] = useState<any[]>([])
  const [userGroups, setUserGroups] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const supabase = createClient()
    const { data: docsData } = await supabase.from('bcps_document_permissions').select('*')
    const { data: usersData } = await supabase.from('bcps_user_groups').select('*')
    setPerms(docsData || [])
    setUserGroups(usersData || [])
  }

  async function toggleDoc(docSlug: string, groupId: string) {
    const supabase = createClient()
    const exists = perms.some(p => p.document_slug === docSlug && p.group_id === groupId)

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
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '24px', textTransform: 'uppercase' }}>Permissions</h1>

      {/* USER TO GROUP ASSIGNMENT */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', color: '#1672A7' }}>Assign Users to Groups</h2>
        {USERS.map(user => (
          <div key={user.id} style={{ padding: '12px', border: '1px solid #e4e4e4', borderRadius: '8px', marginBottom: '8px' }}>
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
                    {isAssigned ? '✓' : ''}{g.slug}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* DOCUMENT TO GROUP ASSIGNMENT */}
      <div>
        <h2 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', textTransform: 'uppercase', color: '#1672A7' }}>Assign Documents to Groups</h2>
        {DOCS.map(doc => (
          <div key={doc.slug} style={{ padding: '12px', border: '1px solid #e4e4e4', borderRadius: '8px', marginBottom: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>{doc.name}</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {GROUPS.map(g => {
                const hasAccess = perms.some(p => p.document_slug === doc.slug && p.group_id === g.id)
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleDoc(doc.slug, g.id)}
                    style={{
                      padding: '4px 8px',
                      border: hasAccess ? '2px solid #167250' : '1px solid #e4e4e4',
                      background: hasAccess ? '#167250' : '#fff',
                      color: hasAccess ? '#fff' : '#000',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '10px',
                      fontWeight: 600,
                    }}
                  >
                    {hasAccess ? '✓' : ''}{g.slug}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
