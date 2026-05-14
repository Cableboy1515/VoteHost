import { NextResponse } from "next/server"
import crypto from "node:crypto"
import bcrypt from "bcryptjs"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { CreateUserSchema } from "@/lib/validations"
import { csrfCheck } from "@/lib/csrf"

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
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const body = await req.json().catch(() => ({}))
  const parsed = CreateUserSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { email, password, role, setupToken } = parsed.data

  // Determine whether this is the first-run bootstrap (auth-bypass) or a normal admin-only create
  const [setupRow, userCount] = await Promise.all([
    db.setting.findUnique({ where: { key: "setup_completed" } }),
    db.adminUser.count(),
  ])
  const isFirstRun = !setupRow && userCount === 0

  if (isFirstRun) {
    const expected = process.env.SETUP_TOKEN
    if (!expected) {
      return NextResponse.json(
        { error: "SETUP_TOKEN is not configured. Add it to .env, restart the app, then retry. See README." },
        { status: 503 }
      )
    }
    const provided = setupToken ?? ""
    const match =
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    if (!match) {
      return NextResponse.json({ error: "Invalid or missing setup token" }, { status: 401 })
    }
  } else {
    const session = await requireRole("ADMIN")
    if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await db.adminUser.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 })

  const passwordHash = await bcrypt.hash(password, 12)

  if (isFirstRun) {
    // Wrap create + setup flag in a transaction to prevent concurrent bootstrap races
    const created = await db.$transaction(async (tx) => {
      // Re-check inside transaction — guards against concurrent first-run requests
      const count = await tx.adminUser.count()
      if (count > 0) return null

      const user = await tx.adminUser.create({
        data: { email, passwordHash, role: "ADMIN", mustChangePassword: false },
        select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true },
      })
      await tx.setting.upsert({
        where: { key: "setup_completed" },
        update: { value: "true" },
        create: { key: "setup_completed", value: "true" },
      })
      return user
    })

    if (!created) {
      return NextResponse.json({ error: "Setup already completed" }, { status: 409 })
    }
    return NextResponse.json(created, { status: 201 })
  }

  const user = await db.adminUser.create({
    data: { email, passwordHash, role, mustChangePassword: true },
    select: { id: true, email: true, role: true, mustChangePassword: true, createdAt: true },
  })
  return NextResponse.json(user, { status: 201 })
}
