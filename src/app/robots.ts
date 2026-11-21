import type { MetadataRoute } from 'next'

// Keep crawlers out of the areas this site already treats as private.
// src/middleware.ts lets this file and sitemap.xml through without a sign-in.
const SITE = 'https://bcpsmarcomm.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/auth/',
        '/playbooks/',
        '/briefs/',
        '/guides/',
        '/campaigns/',
        '/reports/',
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  }
}
