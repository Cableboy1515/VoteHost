import { NextResponse } from "next/server"
import { getSession, verifyChallengeToken, createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { verifyTotpCode, encryptTotpSecret, generateRecoveryCodes } from "@/lib/totp"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { recordActivity } from "@/lib/recordActivity"

// POST /api/admin/2fa/confirm
// Confirms TOTP enrollment by verifying the first code, then persists the encrypted secret
// and returns one-time recovery codes.
// In the login/challenge flow (challengeToken provided): also issues the session cookie.
// In the settings flow (no challengeToken): session cookie already exists.
export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const { challengeToken, secret, code } = await req.json().catch(() => ({}))
  if (!secret || !code) {
    return NextResponse.json({ error: "Missing secret or code" }, { status: 400 })
  }

  let userId: string | null = null
  let isLoginFlow = false

  if (challengeToken) {
    isLoginFlow = true
    userId = await verifyChallengeToken(challengeToken, "enroll")
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired enrollment token" }, { status: 401 })
    }
  } else {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    userId = session.sub
  }

  if (!verifyTotpCode(secret, code)) {
    return NextResponse.json({ error: "Incorrect code — try again" }, { status: 400 })
  }

  const { codes, hashes } = await generateRecoveryCodes()
  const secretEnc = encryptTotpSecret(secret)

  const user = await db.adminUser.update({
    where: { id: userId },
    data: {
      totpSecretEnc: secretEnc,
      totpEnabledAt: new Date(),
      recoveryCodeHashes: hashes,
    },
    select: { id: true, email: true, role: true, tokenVersion: true },
  })

  await recordActivity({
    session: { sub: user.id, email: user.email, role: user.role },
    action: "twofa.enable",
    targetType: "user",
    targetId: user.id,
    targetLabel: user.email,
  })

  const res = NextResponse.json({ ok: true, recoveryCodes: codes })

  if (isLoginFlow) {
    // Enrollment was part of the login flow — now that 2FA is confirmed, grant the session
    const sessionToken = await createSession(user)
    res.cookies.set(COOKIE, sessionToken, SESSION_COOKIE_OPTIONS)
  }

  return res
}
