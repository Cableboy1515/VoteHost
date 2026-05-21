import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

// POST /api/admin/2fa/dismiss-prompt
// Records that the user has dismissed the 2FA setup recommendation; stops showing the interstitial.
export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await db.adminUser.update({
    where: { id: session.sub },
    data: { twoFactorPromptDismissedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
