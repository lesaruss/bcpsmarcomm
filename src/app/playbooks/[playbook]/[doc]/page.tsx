// src/app/playbooks/[playbook]/[doc]/page.tsx
// Renders a BCPS doc (briefings type='record', brand_slug='bcps') under its parent Playbook.
// Standard: canon-bcps-doc-url-standard (Sean, 2026-09-03).
// Slug resolution: the doc is looked up by slug alone. If the path's [playbook] segment
// does not match the doc's real parent, or the slug is actually a Playbook, this 301s to
// the canonical location, so moving a doc between Playbooks never breaks a link.
// Legacy briefs (mock_pages surface='brief', not yet migrated) 301 back to /briefs/[slug],
// which stays their canonical address until Phase 3 moves them.
// Access rules mirror /briefs/[slug] exactly (public unless recipients exist; admin bypass).

import { notFound, redirect, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { serviceClient, checkDocAccess, getBcpsDoc, canonicalPath } from '@/lib/bcps-doc-access'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props {
  params: Promise<{ playbook: string; doc: string }>
}

export async function generateMetadata({ params }: Props) {
  const { doc } = await params
  return { title: `${doc} | BCPS` }
}

export default async function BcpsDocPage({ params }: Props) {
  const { playbook, doc: docSlug } = await params
  await headers()

  const db = serviceClient()
  if (!db) notFound()

  const doc = await getBcpsDoc(db, docSlug)

  if (!doc) {
    // Not in the new model yet. If it is a legacy brief, its canonical address is still /briefs/.
    const { data: legacy } = await db
      .from('mock_pages')
      .select('slug')
      .eq('brand', 'bcps')
      .eq('surface', 'brief')
      .eq('slug', docSlug)
      .maybeSingle()
    if (legacy) permanentRedirect(`/briefs/${docSlug}`)
    notFound()
  }

  const canonical = canonicalPath(doc)
  if (doc.type === 'playbook' || doc.parent_playbook_slug !== playbook) {
    permanentRedirect(canonical)
  }

  const access = await checkDocAccess(db, docSlug)
  if (!access.allowed) redirect(`/login?next=${encodeURIComponent(canonical)}`)

  if (doc.content.includes('<script')) {
    return (
      <iframe
        src={`/api/bcps/doc-raw/${docSlug}`}
        title={doc.title ?? docSlug}
        style={{ display: 'block', border: 'none', width: '100%', height: '100vh' }}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }} suppressHydrationWarning>
      <div dangerouslySetInnerHTML={{ __html: doc.content }} />
    </div>
  )
}
