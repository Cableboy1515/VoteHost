import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"

const EMAIL_KEYS = [
  "email_provider",
  "resend_api_key",
  "email_from_address",
  "email_from_name",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_pass",
  "smtp_secure",
] as const

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const rows = await db.setting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } })
    const s: Record<string, string> = {}
    for (const row of rows) s[row.key] = row.value

    return NextResponse.json({
      email_provider:    s.email_provider    ?? "resend",
      resend_api_key:    s.resend_api_key    ?? "",
      email_from_address: s.email_from_address ?? "",
      email_from_name:   s.email_from_name   ?? "VoteHost",
      smtp_host:         s.smtp_host         ?? "",
      smtp_port:         s.smtp_port         ?? "587",
      smtp_user:         s.smtp_user         ?? "",
      smtp_pass:         s.smtp_pass         ?? "",
      smtp_secure:       s.smtp_secure       ?? "false",
    })
  } catch (err) {
    console.error("[settings/email GET]", err)
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  try {
    const upsert = (key: string, value: string) =>
      db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })

    await Promise.all([
      upsert("email_provider",    body.email_provider    ?? "resend"),
      upsert("resend_api_key",    body.resend_api_key    ?? ""),
      upsert("email_from_address", body.email_from_address ?? ""),
      upsert("email_from_name",   body.email_from_name   ?? "VoteHost"),
      upsert("smtp_host",         body.smtp_host         ?? ""),
      upsert("smtp_port",         body.smtp_port         ?? "587"),
      upsert("smtp_user",         body.smtp_user         ?? ""),
      upsert("smtp_pass",         body.smtp_pass         ?? ""),
      upsert("smtp_secure",       body.smtp_secure       ?? "false"),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[settings/email PUT]", err)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
