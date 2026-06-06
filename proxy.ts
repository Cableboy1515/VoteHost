import { NextRequest, NextResponse } from "next/server"

/**
 * Per-request nonce-based Content Security Policy.
 *
 * A fresh random nonce is generated on every HTML response. Next.js automatically
 * stamps the same nonce onto its own inline bootstrap scripts, so hydration works
 * without unsafe-inline. Any injected <script> without the nonce is blocked by the
 * browser regardless of content.
 *
 * style-src keeps 'unsafe-inline' intentionally: recharts and Next.js font loading
 * write inline styles; inline-style injection is low-severity compared to script
 * injection, and the fix (nonces on styles) would add significant complexity.
 *
 * unsafe-eval is allowed in development only — React Refresh uses it. Never in
 * production.
 */
export function proxy(req: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDev = process.env.NODE_ENV !== "production"

  const csp = [
    "default-src 'self'",
    // strict-dynamic: once the nonce'd bootstrap script runs it can load other
    // scripts dynamically (Next.js chunk loading). Removes the need to list every
    // chunk origin.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")

  // Forward the nonce to the page via a request header so server components can
  // read it with `headers().get("x-nonce")` if they need to stamp inline scripts.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("Content-Security-Policy", csp)
  return res
}

export const config = {
  matcher: [
    /*
     * Run on all routes EXCEPT:
     *   - _next/static  (pre-built JS/CSS assets served with their own immutable cache headers)
     *   - _next/image   (image optimizer responses)
     *   - favicon.ico
     *   - /api/*        (JSON endpoints; no HTML, no inline scripts)
     *
     * The security headers from next.config.ts still cover API routes via the
     * static headers() config — the proxy only needs to run where HTML is served.
     */
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
}
