import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { generateInvitationToken } from "@/lib/invitations"
import { sendAdminInvite } from "@/lib/email"
import { absolutizeUrl } from "@/lib/absolutize-url"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const user = await db.adminUser.findUnique({ where: { id }, select: { id: true, email: true } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const { raw, hash, expiresAt } = generateInvitationToken()

  await db.adminUser.update({
    where: { id },
    data: {
      passwordHash: null,
      invitationTokenHash: hash,
      invitationExpiresAt: expiresAt,
      invitedAt: new Date(),
      passwordResetRequestedAt: null,
      tokenVersion: { increment: 1 },
    },
  })

  const setupLink = absolutizeUrl(`/setup-account/${raw}`)
  await sendAdminInvite({ recipientEmail: user.email, setupLink })

  return NextResponse.json({ ok: true })
}
