import { NextResponse } from "next/server"
import { verifyAdminCredentials, createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`login:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 })
  }

  // Per-email rate limit (prevents distributed IP attacks targeting one account)
  const rlEmail = rateLimit(`login:email:${email}`, { limit: 20, windowMs: 3_600_000 })
  if (!rlEmail.ok) return rateLimitResponse(rlEmail.resetAt)

  const user = await verifyAdminCredentials(email, password)
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
  }

  const token = await createSession(user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, SESSION_COOKIE_OPTIONS)
  return res
}
