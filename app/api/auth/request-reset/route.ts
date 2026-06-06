import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { RequestResetSchema } from "@/lib/validations"
import { generateResetToken } from "@/lib/passwordReset"
import { sendPasswordResetLink, sendPasswordResetActivityToAdmins } from "@/lib/email"
import { absolutizeUrl } from "@/lib/absolutize-url"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { getClientIp } from "@/lib/clientIp"

const ACCOUNT_RATE_LIMIT_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const ip = getClientIp(req)
  const rl = rateLimit(`request-reset:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const parsed = RequestResetSchema.safeParse(body)
  // Always 204 — no account enumeration
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const { email } = parsed.data

  const user = await db.adminUser.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, passwordResetRequestedAt: true },
  })

  // Only send for real accounts that have a password set (not pending-invitation accounts)
  if (user && user.passwordHash) {
    const lastRequest = user.passwordResetRequestedAt?.getTime() ?? 0
    const tooSoon = Date.now() - lastRequest < ACCOUNT_RATE_LIMIT_MS

    if (!tooSoon) {
      const { raw, hash, expiresAt } = generateResetToken()
      const now = new Date()

      await db.adminUser.update({
        where: { id: user.id },
        data: {
          passwordResetRequestedAt: now,
          passwordResetTokenHash: hash,
          passwordResetExpiresAt: expiresAt,
        },
      })

      const resetLink = absolutizeUrl(`/reset/${raw}`)
      await sendPasswordResetLink({ recipientEmail: email, resetLink, expiresAt })
        .catch((err) => console.error("[request-reset] sendPasswordResetLink threw:", err))

      const notifyAdmins = await db.setting.findUnique({
        where: { key: "security_notify_admins_on_password_reset" },
      })
      if (notifyAdmins?.value === "true") {
        await sendPasswordResetActivityToAdmins({ event: "requested", requesterEmail: email, occurredAt: now })
          .catch((err) => console.error("[request-reset] sendPasswordResetActivityToAdmins threw:", err))
      }
    }
  }

  return new NextResponse(null, { status: 204 })
}
