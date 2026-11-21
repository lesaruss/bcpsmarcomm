// /guides/[slug] (Sean, 2026-11-10): a restricted guide for someone without a
// BCPS MarComm account. "I want to have actual interactive pages where they
// can get their information." Signed in, it opens the guide in the dashboard
// as before. Signed out, a guide with a password offers the password or a
// sign-in; a correct password opens the interactive guide for 24 hours, with
// only the sections not marked for a role. With no password it goes to login.

import { notFound, redirect } from 'next/navigation'
import { RESTRICTED_GUIDES } from '@/lib/guides/restricted'
import { serviceClient, getSessionEmail } from '@/lib/bcps-doc-access'
import { hasValidPass } from '@/lib/bcps-doc-password'
import DocPasswordGate from '@/components/bcps/DocPasswordGate'
import GuideReader from './GuideReader'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `${RESTRICTED_GUIDES[slug]?.title ?? 'Guide'} | BCPS MarComm`, robots: { index: false, follow: false } }
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params
  const meta = RESTRICTED_GUIDES[slug]
  if (!meta) notFound()

  const home = `/?page=dashboard&tab=documents&doc=${encodeURIComponent(slug)}`
  if (await getSessionEmail()) redirect(home)

  const db = serviceClient()
  if (!db) notFound()
  const pass = await hasValidPass(db, slug)
  const loginHref = `/login?next=${encodeURIComponent(home)}`
  if (pass.valid) return <GuideReader meta={meta} loginHref={loginHref} />
  if (pass.hasPassword) return <DocPasswordGate slug={slug} title={meta.title} loginHref={loginHref} />
  redirect(loginHref)
}
