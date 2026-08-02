/**
 * The session token lives in localStorage, so an XSS is a session takeover.
 * These headers shrink that blast radius: no remote script origins, no framing,
 * no plugin content, and no downgrade of API traffic to plaintext HTTP.
 *
 * 'unsafe-inline' stays in script-src because the theme bootstrap
 * (components/theme-script.tsx) runs inline before hydration to avoid a
 * light/dark flash, and statically prerendered pages cannot carry a per-request
 * nonce. connect-src stays broad on https: because the backend origin is
 * resolved at runtime (Cloudflare tunnel) rather than known at build time, and
 * plain-http loopback is allowed so a locally hosted API still works — an
 * attacker gains nothing from posting to the victim's own machine.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss: http://localhost:* http://127.0.0.1:*",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
