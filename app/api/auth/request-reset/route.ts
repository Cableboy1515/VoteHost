import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { RequestResetSchema } from "@/lib/validations"
import { sendPasswordResetRequest } from "@/lib/email"
import { csrfCheck } from "@/lib/csrf"

const RATE_LIMIT_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const body = await req.json().catch(() => ({}))
  const parsed = RequestResetSchema.safeParse(body)
  // Always 204 — no enumeration
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const { email } = parsed.data

  const user = await db.adminUser.findUnique({
    where: { email },
    select: { id: true, passwordResetRequestedAt: true },
  })

  if (user) {
    const lastRequest = user.passwordResetRequestedAt?.getTime() ?? 0
    const tooSoon = Date.now() - lastRequest < RATE_LIMIT_MS

    if (!tooSoon) {
      await db.adminUser.update({
        where: { id: user.id },
        data: { passwordResetRequestedAt: new Date() },
      })
      await sendPasswordResetRequest(email).catch(() => {})
    }
  }

  return new NextResponse(null, { status: 204 })
}
