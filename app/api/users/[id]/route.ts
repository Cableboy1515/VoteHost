import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { UpdateUserSchema } from "@/lib/validations"
import { csrfCheck } from "@/lib/csrf"
import { recordActivity } from "@/lib/recordActivity"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (session.sub === id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
  }

  const before = await db.adminUser.findUnique({ where: { id }, select: { email: true, role: true } })
  const user = await db.adminUser.update({
    where: { id },
    data: {
      role: parsed.data.role,
      tokenVersion: { increment: 1 },
    },
    select: { id: true, email: true, role: true, createdAt: true, invitationExpiresAt: true, passwordResetRequestedAt: true, passwordHash: true },
  })
  await recordActivity({
    session,
    action: "user.role_change",
    targetType: "user",
    targetId: id,
    targetLabel: user.email,
    metadata: { from: before?.role, to: user.role },
  })
  return NextResponse.json({ ...user, hasPassword: user.passwordHash !== null, passwordHash: undefined })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(_req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  if (session.sub === id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
  }

  const deletedUser = await db.adminUser.findUnique({ where: { id }, select: { email: true } })
  await db.adminUser.delete({ where: { id } })
  await recordActivity({
    session,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    targetLabel: deletedUser?.email ?? id,
  })
  return NextResponse.json({ ok: true })
}
