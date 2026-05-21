import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { verifyTotpCode, decryptTotpSecret } from "@/lib/totp"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

// POST /api/admin/2fa/disable
// Disables TOTP for the authenticated user after verifying the current code.
// ADMIN and ORGANIZER can re-enroll any time from account settings.
export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { code } = await req.json().catch(() => ({}))
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 })

  const user = await db.adminUser.findUnique({
    where: { id: session.sub },
    select: { totpSecretEnc: true, totpEnabledAt: true },
  })

  if (!user?.totpEnabledAt || !user.totpSecretEnc) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 })
  }

  const secret = decryptTotpSecret(user.totpSecretEnc)
  if (!verifyTotpCode(secret, code)) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 400 })
  }

  await db.adminUser.update({
    where: { id: session.sub },
    data: {
      totpSecretEnc: null,
      totpEnabledAt: null,
      recoveryCodeHashes: [],
    },
  })

  return NextResponse.json({ ok: true })
}
