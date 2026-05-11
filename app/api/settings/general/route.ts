import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

const GENERAL_KEYS = ["image_retention_days"] as const

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rows = await db.setting.findMany({ where: { key: { in: [...GENERAL_KEYS] } } })
  const s: Record<string, string> = {}
  for (const row of rows) s[row.key] = row.value

  return NextResponse.json({
    image_retention_days: s.image_retention_days ?? "30",
  })
}

export async function PUT(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const days = String(body.image_retention_days ?? "30").trim()

  // Validate: empty string (disabled) or a positive integer
  if (days !== "" && (!/^\d+$/.test(days) || parseInt(days, 10) < 1)) {
    return NextResponse.json({ error: "Retention must be a positive number of days, or empty to disable" }, { status: 400 })
  }

  await db.setting.upsert({
    where: { key: "image_retention_days" },
    update: { value: days },
    create: { key: "image_retention_days", value: days },
  })

  return NextResponse.json({ ok: true })
}
