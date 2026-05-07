type Window = { count: number; resetAt: number }

const store = new Map<string, Window>()

export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  let w = store.get(key)

  if (!w || now > w.resetAt) {
    w = { count: 1, resetAt: now + windowMs }
    store.set(key, w)
    return { ok: true, remaining: limit - 1, resetAt: w.resetAt }
  }

  w.count++
  if (w.count > limit) {
    return { ok: false, remaining: 0, resetAt: w.resetAt }
  }

  return { ok: true, remaining: limit - w.count, resetAt: w.resetAt }
}

export function rateLimitResponse(resetAt: number) {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000)
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  })
}
