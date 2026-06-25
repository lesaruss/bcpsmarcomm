// src/app/briefs/[slug]/page.tsx
// Public route for BCPS briefs -- no auth required.
// Route: bcpsmarcomm.com/briefs/[slug]

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
  return { title: `${slug} | BCPS Brief` }
}

export default async function BcpsPublicBriefPage({ params }: Props) {
  const { slug } = await params

  // Force no-cache so Vercel edge never serves stale content
  const headersList = await headers()

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
    <div
      style={{ minHeight: '100vh', background: '#fff' }}
      suppressHydrationWarning
    >
      <div dangerouslySetInnerHTML={{ __html: data.content }} />
    </div>
  )
}
