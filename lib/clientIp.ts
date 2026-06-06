/**
 * Extract the real client IP from an incoming request.
 *
 * Priority order:
 *  1. CF-Connecting-IP — set exclusively by Cloudflare's edge; not forgeable by clients.
 *  2. X-Real-IP        — set by nginx / Tailscale; not forwarded by clients in typical configs.
 *  3. X-Forwarded-For  — use the RIGHTMOST hop (closest trusted proxy), never the leftmost,
 *                        because a client can inject arbitrary leftmost values.
 *  4. "unknown"        — shared bucket; rate-limits still apply, just less granular.
 *
 * Never trust the leftmost X-Forwarded-For element as the client IP. That entry is
 * client-supplied and freely forgeable, allowing rate-limit key rotation.
 */
export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")
  if (cf) return cf.trim()

  const real = req.headers.get("x-real-ip")
  if (real) return real.trim()

  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const hops = xff.split(",")
    return hops[hops.length - 1].trim()
  }

  return "unknown"
}
