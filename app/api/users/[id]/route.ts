import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { UpdateUserSchema } from "@/lib/validations"
import { csrfCheck } from "@/lib/csrf"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = UpdateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { role, password } = parsed.data

  if (role && session.sub === id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (role) {
    data.role = role
    data.tokenVersion = { increment: 1 } // invalidate victim's existing sessions
  }
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 12)
    data.mustChangePassword = true
    data.passwordChangedAt = new Date()
    data.tokenVersion = { increment: 1 } // invalidate victim's existing sessions
  }

  const user = await db.adminUser.update({
    where: { id },
    data,
    select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  })
  return NextResponse.json(user)
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

  await db.adminUser.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
