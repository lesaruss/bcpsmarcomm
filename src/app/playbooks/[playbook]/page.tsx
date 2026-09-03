// src/app/playbooks/[playbook]/page.tsx
// Renders a BCPS Playbook (briefings type='playbook', brand_slug='bcps').
// Standard: canon-bcps-doc-url-standard (Sean, 2026-09-03). Two levels:
// /playbooks/[playbook] is the Playbook, /playbooks/[playbook]/[doc] is a doc under it.
// Access rules mirror /briefs/[slug] exactly (public unless recipients exist; admin bypass).

import { notFound, redirect, permanentRedirect } from 'next/navigation'
import { headers } from 'next/headers'
import { serviceClient, checkDocAccess, getBcpsDoc, canonicalPath } from '@/lib/bcps-doc-access'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props {
  params: Promise<{ playbook: string }>
}

export async function generateMetadata({ params }: Props) {
  const { playbook } = await params
  return { title: `${playbook} | BCPS Playbook` }
}

export default async function BcpsPlaybookPage({ params }: Props) {
  const { playbook } = await params
  await headers()

  const db = serviceClient()
  if (!db) notFound()

  const doc = await getBcpsDoc(db, playbook)
  if (!doc) notFound()

  // A doc slug typed at the playbook level resolves to its canonical home.
  if (doc.type !== 'playbook') permanentRedirect(canonicalPath(doc))

  const access = await checkDocAccess(db, playbook)
  if (!access.allowed) redirect(`/login?next=/playbooks/${playbook}`)

  if (doc.content.includes('<script')) {
    return (
      <iframe
        src={`/api/bcps/doc-raw/${playbook}`}
        title={doc.title ?? playbook}
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
