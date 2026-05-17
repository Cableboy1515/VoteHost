import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { SetupAccountSchema } from "@/lib/validations"
import { hashInvitationToken } from "@/lib/invitations"
import { csrfCheck } from "@/lib/csrf"
import { createSession, COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const hash = hashInvitationToken(token)
  const user = await db.adminUser.findUnique({
    where: { invitationTokenHash: hash },
    select: { email: true, invitationExpiresAt: true },
  })

  if (!user) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })

  const expired = !user.invitationExpiresAt || user.invitationExpiresAt < new Date()
  return NextResponse.json({ email: user.email, expired })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = SetupAccountSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const hash = hashInvitationToken(token)
  const user = await db.adminUser.findUnique({
    where: { invitationTokenHash: hash },
    select: { id: true, invitationExpiresAt: true },
  })

  if (!user) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 })
  if (!user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
    return NextResponse.json({ error: "This setup link has expired. Request a new one from your administrator." }, { status: 410 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12)

  const updatedUser = await db.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash,
      invitationTokenHash: null,
      invitationExpiresAt: null,
      passwordResetRequestedAt: null,
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, role: true, tokenVersion: true },
  })

  const sessionToken = await createSession(updatedUser)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE, sessionToken, SESSION_COOKIE_OPTIONS)
  return res
}
