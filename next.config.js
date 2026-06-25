/** @type {import('next').NextConfig} */
const nextConfig = {
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
