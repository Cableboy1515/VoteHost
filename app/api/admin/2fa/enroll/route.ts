import { NextResponse } from "next/server"
import QRCode from "qrcode"
import { getSession, verifyChallengeToken } from "@/lib/auth"
import { generateTotpSetup } from "@/lib/totp"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

// GET /api/admin/2fa/enroll
// Returns a fresh TOTP secret + provisioning QR code.
// Accepts either an active session (settings flow) or an "enroll" challenge token (login flow).
// Does NOT persist anything — the secret is confirmed in /confirm.
export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const { challengeToken } = await req.json().catch(() => ({}))

  let userId: string | null = null
  let userEmail: string | null = null

  if (challengeToken) {
    userId = await verifyChallengeToken(challengeToken, "enroll")
    if (!userId) {
      return NextResponse.json({ error: "Invalid or expired enrollment token" }, { status: 401 })
    }
    const user = await db.adminUser.findUnique({ where: { id: userId }, select: { email: true, totpEnabledAt: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (user.totpEnabledAt) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 409 })
    }
    userEmail = user.email
  } else {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const user = await db.adminUser.findUnique({ where: { id: session.sub }, select: { email: true, totpEnabledAt: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    if (user.totpEnabledAt) {
      return NextResponse.json({ error: "2FA is already enabled" }, { status: 409 })
    }
    userId = session.sub
    userEmail = user.email
  }

  const { secret, otpauthUrl } = generateTotpSetup(userEmail!)
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 200 })

  return NextResponse.json({ secret, otpauthUrl, qrDataUrl })
}
