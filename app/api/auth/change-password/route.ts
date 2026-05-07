import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSession, createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const rl = rateLimit(`change-password:${session.sub}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { currentPassword, newPassword, confirmPassword } = await req.json().catch(() => ({}))

  if (!currentPassword) {
    return NextResponse.json({ error: "Current password is required" }, { status: 400 })
  }
  if (!newPassword || newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const existing = await db.adminUser.findUnique({ where: { id: session.sub } })
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const currentValid = await bcrypt.compare(currentPassword, existing.passwordHash)
  if (!currentValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 })
  }

  const passwordHash = await bcrypt.hash(newPassword, 12)
  const user = await db.adminUser.update({
    where: { id: session.sub },
    data: {
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
  })

  const token = await createSession(user)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, token, SESSION_COOKIE_OPTIONS)
  return res
}
