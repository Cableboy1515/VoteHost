import { NextResponse } from "next/server"
import { verifyChallengeToken, createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { verifyTotpCode, decryptTotpSecret, findMatchingRecoveryCode } from "@/lib/totp"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

// POST /api/admin/2fa/verify
// Step 2 of the login flow: user provides a TOTP code or recovery code.
// On success, the vh_session cookie is set and the challenge token is consumed.
export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`2fa:ip:${ip}`, { limit: 10, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { challengeToken, code, recoveryCode } = await req.json().catch(() => ({}))
  if (!challengeToken) return NextResponse.json({ error: "Missing challenge token" }, { status: 400 })
  if (!code && !recoveryCode) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const userId = await verifyChallengeToken(challengeToken, "totp")
  if (!userId) return NextResponse.json({ error: "Invalid or expired challenge token" }, { status: 401 })

  const user = await db.adminUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      tokenVersion: true,
      totpSecretEnc: true,
      totpEnabledAt: true,
      recoveryCodeHashes: true,
    },
  })

  if (!user || !user.totpEnabledAt || !user.totpSecretEnc) {
    return NextResponse.json({ error: "2FA is not configured" }, { status: 400 })
  }

  const secret = decryptTotpSecret(user.totpSecretEnc)

  if (code) {
    if (!verifyTotpCode(secret, code)) {
      return NextResponse.json({ error: "Incorrect code" }, { status: 400 })
    }
  } else {
    // Recovery code path
    const idx = await findMatchingRecoveryCode(recoveryCode, user.recoveryCodeHashes)
    if (idx === -1) return NextResponse.json({ error: "Invalid recovery code" }, { status: 400 })

    // Remove the used recovery code — one-time use only
    const remaining = [...user.recoveryCodeHashes]
    remaining.splice(idx, 1)
    await db.adminUser.update({
      where: { id: userId },
      data: { recoveryCodeHashes: remaining },
    })
  }

  const sessionToken = await createSession(user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, sessionToken, SESSION_COOKIE_OPTIONS)
  return res
}
