/** @type {import('next').NextConfig} */
const nextConfig = {
  // @sparticuz/chromium ships its bin/ (fonts, swiftshader, chromium.br) as
  // plain files that must reach the Lambda unbundled - if webpack bundles
  // the package, the path it resolves at runtime ("<app>/bin") doesn't
  // exist. serverComponentsExternalPackages keeps it out of the bundle;
  // outputFileTracingIncludes makes sure Vercel's file tracer still ships
  // bin/ alongside the ada-scan route's Lambda. Added 2026-08-19 after a
  // live verification run confirmed WAVE + Lighthouse worked but axe-core
  // failed with "input directory .../chromium/bin does not exist".
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'axe-core'],
    outputFileTracingIncludes: {
      '/api/bcps/ada-scan': [
        './node_modules/@sparticuz/chromium/bin/**',
        './node_modules/axe-core/axe.min.js',
      ],
    },
  },
  async rewrites() {
    return [
      // bcpsmarcomm.com subdomain routing is handled entirely in src/middleware.ts
      // (next.config.js /:path* does not match the empty root path /)

      // SPA routes for the main lesaruss-ai app
      {
        source: "/:page(dashboard|notes|profile|departments|analytics|superadmin|marcomm|minutes|wcm|queue)",
        destination: "/",
      },
    ]
  },
}
module.exports = nextConfig;
