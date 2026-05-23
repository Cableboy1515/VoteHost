import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { getDisplayTimeZone, invalidateTimezoneCache, isValidTimeZone, SETTING_KEY as TZ_SETTING_KEY } from "@/lib/timezone"

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const [rows, effectiveTz] = await Promise.all([
    db.setting.findMany({ where: { key: "image_retention_days" } }),
    getDisplayTimeZone(),
  ])
  const s: Record<string, string> = {}
  for (const row of rows) s[row.key] = row.value

  return NextResponse.json({
    image_retention_days: s.image_retention_days ?? "30",
    display_time_zone: effectiveTz,
  })
}

export async function PUT(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const updates: Promise<unknown>[] = []

  if ("image_retention_days" in body) {
    const days = String(body.image_retention_days ?? "30").trim()
    if (days !== "" && (!/^\d+$/.test(days) || parseInt(days, 10) < 1)) {
      return NextResponse.json({ error: "Retention must be a positive number of days, or empty to disable" }, { status: 400 })
    }
    updates.push(db.setting.upsert({
      where: { key: "image_retention_days" },
      update: { value: days },
      create: { key: "image_retention_days", value: days },
    }))
  }

  if ("display_time_zone" in body) {
    const tz = String(body.display_time_zone ?? "").trim()
    if (!tz || !isValidTimeZone(tz)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 })
    }
    updates.push(db.setting.upsert({
      where: { key: TZ_SETTING_KEY },
      update: { value: tz },
      create: { key: TZ_SETTING_KEY, value: tz },
    }))
    invalidateTimezoneCache()
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 })
  }

  await Promise.all(updates)
  return NextResponse.json({ ok: true })
}
