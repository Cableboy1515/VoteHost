import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { ChangePasswordSchema } from "@/lib/validations"
import { requireRole, createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { sendPasswordChangedNotice } from "@/lib/email"

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("VIEWER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`change-password:${session.sub}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const user = await db.adminUser.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, role: true, passwordHash: true },
  })

  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const newPasswordHash = await bcrypt.hash(parsed.data.newPassword, 12)
  const changedAt = new Date()

  const updated = await db.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash: newPasswordHash,
      passwordChangedAt: changedAt,
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, role: true, tokenVersion: true },
  })

  // Issue a fresh session so the user stays logged in despite tokenVersion bump
  const newToken = await createSession(updated as Parameters<typeof createSession>[0])
  const jar = await cookies()
  jar.set(COOKIE, newToken, SESSION_COOKIE_OPTIONS)

  await sendPasswordChangedNotice({ recipientEmail: user.email, changedAt })
    .catch((err) => console.error("[change-password] sendPasswordChangedNotice threw:", err))

  return NextResponse.json({ ok: true })
}
