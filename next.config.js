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
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'axe-core', 'tesseract.js', 'tesseract.js-core', 'sharp'],
    outputFileTracingIncludes: {
      '/api/bcps/ada-scan': [
        './node_modules/@sparticuz/chromium/bin/**',
        './node_modules/axe-core/axe.min.js',
      ],
      // school-scan added 2026-08-19: same axe-core/chromium engine, used by
      // the school-facing /school-portal page instead of the DWT scanner.
      '/api/bcps/school-scan': [
        './node_modules/@sparticuz/chromium/bin/**',
        './node_modules/axe-core/axe.min.js',
      ],
      // Banner content scan added 2026-09-03 (lib/bannerVision.ts) - same
      // problem as ada-scan above, different package: tesseract.js spawns a
      // Node worker_thread via a runtime path.join(__dirname, ...) that
      // Vercel's file tracer can't see statically, so the worker script and
      // the WASM OCR core never made it into the Lambda on the first deploy
      // ("Cannot find module '/var/task/.next/worker-script/node/index.js'",
      // confirmed live via runtime logs after every image upload hung until
      // timeout). serverComponentsExternalPackages keeps both packages out
      // of the webpack bundle entirely (same treatment as chromium above);
      // these globs make sure the file tracer still ships their actual
      // files alongside the Lambda. sharp is included too since it also
      // loads a native/WASM binary at runtime, not via static require.
      '/api/banner/scan': [
        './node_modules/tesseract.js/src/worker-script/node/**',
        './node_modules/tesseract.js-core/**',
        './node_modules/sharp/**',
      ],
      '/api/banner/submit': [
        './node_modules/tesseract.js/src/worker-script/node/**',
        './node_modules/tesseract.js-core/**',
        './node_modules/sharp/**',
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
