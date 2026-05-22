import type { NextConfig } from "next"
import { execSync } from "child_process"
import { version as appVersion } from "./package.json"

const gitSha = (() => {
  if (process.env.NEXT_PUBLIC_GIT_SHA) return process.env.NEXT_PUBLIC_GIT_SHA
  try {
    return execSync("git rev-parse --short HEAD").toString().trim()
  } catch {
    return "dev"
  }
})()

const securityHeaders = [
  { key: "X-Content-Type-Options",   value: "nosniff" },
  { key: "X-Frame-Options",          value: "DENY" },
  { key: "Referrer-Policy",          value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",       value: "camera=(), microphone=(), geolocation=()" },
  // next.js app-router hydration requires unsafe-inline / unsafe-eval for scripts.
  // Tighten to nonces if a future middleware generates per-request nonces.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  // HSTS — only effective when served over HTTPS (behind Cloudflare/Tailscale/nginx).
  // Browsers ignore HSTS on plain HTTP, so this is safe to set unconditionally.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
]

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdfkit", "archiver", "unzipper"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
