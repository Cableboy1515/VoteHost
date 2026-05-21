import { NextResponse } from "next/server"
import { verifyAdminCredentials, createSession, createChallengeToken, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
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

  // If TOTP is enrolled, issue a challenge token — session is withheld until code verified
  if (user.totpEnabledAt) {
    const challengeToken = await createChallengeToken(user.id, "totp")
    return NextResponse.json({ ok: true, totpRequired: true, challengeToken })
  }

  // ADMIN and ORGANIZER must enroll in TOTP before getting a session
  if (user.role === "ADMIN" || user.role === "ORGANIZER") {
    const challengeToken = await createChallengeToken(user.id, "enroll")
    return NextResponse.json({ ok: true, enrollmentRequired: true, challengeToken })
  }

  // VIEWER: no 2FA requirement — issue session directly
  const token = await createSession(user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, SESSION_COOKIE_OPTIONS)
  return res
}
