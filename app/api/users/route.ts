import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { requireRole, getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { CreateUserSchema } from "@/lib/validations"

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const users = await db.adminUser.findMany({
    select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  // Allow unauthenticated if no users exist yet (first-run setup)
  const userCount = await db.adminUser.count()
  if (userCount > 0) {
    const session = await requireRole("ADMIN")
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { email, password, role } = parsed.data
  const existing = await db.adminUser.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await db.adminUser.create({
    data: { email, passwordHash, role, mustChangePassword: userCount > 0 },
    select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
