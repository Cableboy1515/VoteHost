import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await db.setting.upsert({
    where: { key: "email_wizard_seen" },
    update: { value: "true" },
    create: { key: "email_wizard_seen", value: "true" },
  })

  return NextResponse.json({ ok: true })
}
