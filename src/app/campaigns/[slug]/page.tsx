// src/app/campaigns/[slug]/page.tsx
//
// A campaign report as a shareable document.
//
// Sean, 2026-09-22: opening a campaign should not expand in place on the
// Analytics page. It should open the way a doc opens - its own page, its own
// header, its own URL - so it can be handed to someone.
//
// ACCESS IS NOT PUBLIC. Sean raised public viewing and then ruled it out in the
// same breath. This route is gated by checkCampaignReportAccess, which is
// default deny: BCPS admins, the Office of Communications group, and named
// individuals holding a direct grant. It deliberately does NOT use
// checkDocAccess, which is public-unless-recipients-exist and would have made
// these reports world-readable the moment nobody was listed. See
// src/lib/bcps-campaign-access.ts for the full reasoning.
//
// The SHELL follows canon-bcps-doc-template-standard: fixed BCPS-blue header
// with the District logo linked back to the dashboard, a meta row, a plain
// green-labelled lead section that always stays open, full width, no centred
// column.
//
// The BODY navigates by tabs, not accordions. Sean, 2026-09-22: "we don't have
// to make things documents if it's on a web page." The page keeps everything
// that makes it shareable - its own URL, the header, the access gate - while
// the content reads as an app surface, because four stacked accordions is a
// long scroll where a tab strip is one click. That is a deliberate departure
// from the accordion rule, which governs authored documents in briefings, not
// a live report. Do not restore accordions here.
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  campaignServiceClient,
  getSessionUser,
  checkCampaignReportAccess,
} from '@/lib/bcps-campaign-access'
import { CampaignReportBody, type Campaign } from '@/components/bcps/CampaignReport'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `Campaign report | BCPS`, robots: { index: false, follow: false }, description: slug }
}

const DAYS = 60

export default async function CampaignReportPage({ params }: Props) {
  const { slug } = await params
  await headers()

  const db = campaignServiceClient()
  if (!db) notFound()

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/campaigns/${slug}`)}`)

  const access = await checkCampaignReportAccess(db, user.id)
  if (!access.allowed) {
    return (
      <main style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'Arial, Helvetica, sans-serif', padding: '80px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>You do not have access to this report</h1>
        <p style={{ fontSize: 13, color: '#666', maxWidth: 480, margin: '10px auto 0', lineHeight: 1.6 }}>
          Campaign reports are shared with the Office of Communications and a small
          number of named people. Ask the District Web Team if you need access.
        </p>
      </main>
    )
  }

  const { data: campaign } = await db
    .from('bcps_campaigns')
    .select('id, name, slug, page_paths, primary_url, description, owner, status, start_date, end_date, include_subpages')
    .eq('slug', slug)
    .maybeSingle()
  if (!campaign) notFound()

  const [{ data: metricsRows }, { data: daily }] = await Promise.all([
    db.from('bcps_campaign_analytics').select('*').eq('campaign_id', campaign.id).order('period', { ascending: false }).limit(1),
    db.from('bcps_campaign_daily')
      .select('date, unique_visitors, page_views, sessions, engagement_seconds')
      .eq('campaign_id', campaign.id)
      .gte('date', new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10))
      .order('date'),
  ])

  const full: Campaign = {
    ...campaign,
    metrics: metricsRows?.[0] ?? null,
    daily: daily ?? [],
  } as Campaign

  return (
    <>
      <style>{`
        :root { --bcps-blue:#1672A7; --bcps-blue-dark:#0e4e73; --bcps-green:#16750C;
                --border:rgba(0,0,0,0.10); --surface:#fff; --surface2:#fafafa; --text-50:rgba(26,26,26,0.55); }
        *,*::before,*::after { box-sizing:border-box; }
        body { margin:0; background:#f5f5f5; color:#1a1a1a;
               font-family:Arial,Helvetica,Verdana,sans-serif; line-height:1.55; }
        header.bcps-header { position:fixed; top:0; left:0; right:0; z-index:200; height:64px;
          background:#fff; border-bottom:3px solid var(--bcps-blue); display:flex;
          align-items:center; padding:0 28px; gap:20px; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
        .bcps-logo-link { display:flex; align-items:center; }
        .bcps-logo { height:44px; width:auto; display:block; }
        .bcps-header-divider { width:1px; height:32px; background:var(--border); }
        .bcps-header-title { font-size:12px; font-weight:800; text-transform:uppercase;
          letter-spacing:0.16em; color:var(--bcps-blue); }
        main { max-width:none; margin:0; padding:86px 40px 80px; }
        h1 { font-size:26px; font-weight:800; margin:0 0 4px; }
        h2 { font-size:15px; font-weight:800; margin:14px 0; text-transform:uppercase; letter-spacing:.04em; }
        h2.lead-heading { color:var(--bcps-green); margin:0 0 16px; }
        .meta-row { display:flex; flex-wrap:wrap; gap:26px; padding:14px 0 18px; border-bottom:1px solid var(--border); margin-bottom:20px; }
        .meta-item { display:flex; flex-direction:column; gap:2px; }
        .meta-label { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-50); }
        .meta-value { font-size:12.5px; font-weight:700; }
        .section-block { border:1px solid var(--border); border-radius:8px; background:var(--surface); padding:18px 20px; margin-bottom:14px; }
        @media (max-width:600px) { main { padding:80px 16px 60px; } .meta-row { gap:16px; } }
      `}</style>

      <header className="bcps-header" role="banner">
        <a className="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS Marcom dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
            alt="Broward County Public Schools"
            className="bcps-logo"
          />
        </a>
        <div className="bcps-header-divider" aria-hidden="true" />
        <span className="bcps-header-title">BCPS Marcom &middot; Campaign Report</span>
      </header>

      <main>
        <h1>{campaign.name}</h1>
        {campaign.description && (
          <p style={{ fontSize: 12.5, color: 'var(--text-50)', margin: '0 0 6px', maxWidth: 780 }}>{campaign.description}</p>
        )}
        <CampaignReportBody campaign={full} />
        <p style={{ fontSize: 10.5, color: 'var(--text-50)', marginTop: 24, lineHeight: 1.6, maxWidth: 780 }}>
          This report is not public. It is shared with the Office of Communications and
          named individuals. Numbers refresh from GA4 on each sync, so the link stays
          current rather than going stale the way an exported copy would.
        </p>
      </main>
    </>
  )
}
