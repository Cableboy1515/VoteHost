import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

const KEY = "security_notify_admins_on_password_reset"

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const row = await db.setting.findUnique({ where: { key: KEY } })
  return NextResponse.json({ notifyAdminsOnReset: row?.value === "true" })
}

export async function PATCH(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (typeof body.notifyAdminsOnReset !== "boolean") {
    return NextResponse.json({ error: "notifyAdminsOnReset must be a boolean" }, { status: 400 })
  }

  await db.setting.upsert({
    where: { key: KEY },
    update: { value: String(body.notifyAdminsOnReset) },
    create: { key: KEY, value: String(body.notifyAdminsOnReset) },
  })

  return NextResponse.json({ ok: true })
}
