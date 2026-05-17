import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { ResetPasswordSchema } from "@/lib/validations"
import { hashResetToken } from "@/lib/passwordReset"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { sendPasswordChangedNotice, sendPasswordResetActivityToAdmins } from "@/lib/email"
import { createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const hash = hashResetToken(token)
  const user = await db.adminUser.findUnique({
    where: { passwordResetTokenHash: hash },
    select: { email: true, passwordResetExpiresAt: true },
  })

  if (!user) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })

  const expired = !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()
  return NextResponse.json({ email: user.email, expired })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const { token } = await params

  const rl = rateLimit(`reset-consume:${token.slice(0, 16)}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const hash = hashResetToken(token)
  const user = await db.adminUser.findUnique({
    where: { passwordResetTokenHash: hash },
    select: { id: true, email: true, passwordResetExpiresAt: true },
  })

  if (!user) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })
  if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 410 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const changedAt = new Date()

  const updatedUser = await db.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      passwordResetRequestedAt: null,
      passwordChangedAt: changedAt,
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, role: true, tokenVersion: true },
  })

  const sessionToken = await createSession(updatedUser)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, sessionToken, SESSION_COOKIE_OPTIONS)

  await sendPasswordChangedNotice({ recipientEmail: user.email, changedAt })
    .catch((err) => console.error("[reset] sendPasswordChangedNotice threw:", err))

  const notifyAdmins = await db.setting.findUnique({
    where: { key: "security_notify_admins_on_password_reset" },
  })
  if (notifyAdmins?.value === "true") {
    await sendPasswordResetActivityToAdmins({ event: "completed", requesterEmail: user.email, occurredAt: changedAt })
      .catch((err) => console.error("[reset] sendPasswordResetActivityToAdmins threw:", err))
  }

  return res
}
