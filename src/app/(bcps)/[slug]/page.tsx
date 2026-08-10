// src/app/bcps/[slug]/page.tsx
// SSR page for a specific BCPS brief by slug.
// Route: k12unlocked.com/bcps/[slug]

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return {
    title: `${slug} | BCPS Brief`,
  }
}

export default async function BcpsBriefPage({ params }: Props) {
  const { slug } = await params

  const db = serviceClient()
  if (!db) notFound()

  const { data, error } = await db
    .from('mock_pages')
    .select('title, content, updated_at')
    .eq('brand', 'bcps')
    .eq('surface', 'brief')
    .eq('slug', slug)
    .single()

  if (error || !data) notFound()

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <div dangerouslySetInnerHTML={{ __html: data.content }} />
    </div>
  )
}
