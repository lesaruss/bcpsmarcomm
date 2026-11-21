import type { MetadataRoute } from 'next'

// bcpsmarcomm.com is a signed-in platform for Broward County Public Schools.
// Only the front door is listed (2026-11-11). Documents, playbooks, briefs,
// guides, campaign and department reports, dashboards, staff registration and
// request forms are internal and are deliberately left out. www redirects to
// the bare domain (next.config.js), so the bare domain is canonical.
const SITE = 'https://bcpsmarcomm.com'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE}/`, changeFrequency: 'monthly', priority: 1 },
  ]
}
