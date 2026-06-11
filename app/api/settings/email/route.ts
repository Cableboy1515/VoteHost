import { NextResponse } from "next/server"
import { BRAND_NAME } from "@/lib/branding"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { recordActivity } from "@/lib/recordActivity"

const SECRET_KEYS = ["resend_api_key", "smtp_pass", "resend_webhook_secret"] as const
const EMAIL_KEYS = [
  "email_provider",
  "email_preset",
  "resend_api_key",
  "resend_webhook_secret",
  "email_from_address",
  "email_from_name",
  "email_reply_to",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_pass",
  "smtp_secure",
] as const

const SENTINEL = "***"

export async function GET() {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const rows = await db.setting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } })
    const s: Record<string, string> = {}
    for (const row of rows) s[row.key] = row.value

    return NextResponse.json({
      email_provider:          s.email_provider     ?? "resend",
      email_preset:            s.email_preset       ?? (s.email_provider === "smtp" ? "smtp" : "resend"),
      resend_api_key:          s.resend_api_key     ? SENTINEL : "",
      resend_webhook_secret:   s.resend_webhook_secret ? SENTINEL : "",
      email_from_address:      s.email_from_address ?? "",
      email_from_name:         s.email_from_name    ?? BRAND_NAME,
      email_reply_to:          s.email_reply_to     ?? "",
      smtp_host:               s.smtp_host          ?? "",
      smtp_port:               s.smtp_port          ?? "587",
      smtp_user:               s.smtp_user          ?? "",
      smtp_pass:               s.smtp_pass          ? SENTINEL : "",
      smtp_secure:             s.smtp_secure        ?? "false",
    })
  } catch (err) {
    console.error("[settings/email GET]", err)
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))

  try {
    // Read current values so we can log a before/after diff (secrets are always redacted)
    const existingRows = await db.setting.findMany({ where: { key: { in: [...EMAIL_KEYS] } } })
    const existing: Record<string, string> = {}
    for (const r of existingRows) existing[r.key] = r.value

    const upsert = (key: string, value: string | undefined, existingKey: string) => {
      // If client sends SENTINEL back for a secret field, retain the existing DB value
      if ((SECRET_KEYS as readonly string[]).includes(existingKey) && value === SENTINEL) return null
      if (value === undefined) return null
      return db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    }

    // Single batch transaction: one connection, all-or-nothing — avoids partial
    // saves and connection bursts that the local prisma dev server can't handle.
    await db.$transaction([
      upsert("email_provider",        body.email_provider        ?? "resend",   "email_provider"),
      upsert("email_preset",          body.email_preset          ?? "resend",   "email_preset"),
      upsert("resend_api_key",        body.resend_api_key,                       "resend_api_key"),
      upsert("resend_webhook_secret", body.resend_webhook_secret,                "resend_webhook_secret"),
      upsert("email_from_address",    body.email_from_address    ?? "",          "email_from_address"),
      upsert("email_from_name",       body.email_from_name       ?? BRAND_NAME,  "email_from_name"),
      upsert("email_reply_to",        body.email_reply_to        ?? "",          "email_reply_to"),
      upsert("smtp_host",             body.smtp_host             ?? "",          "smtp_host"),
      upsert("smtp_port",             body.smtp_port             ?? "587",       "smtp_port"),
      upsert("smtp_user",             body.smtp_user             ?? "",          "smtp_user"),
      upsert("smtp_pass",             body.smtp_pass,                            "smtp_pass"),
      upsert("smtp_secure",           body.smtp_secure           ?? "false",     "smtp_secure"),
    ].filter((op) => op !== null))

    const submittedKeys = Object.keys(body).filter((k) => [...EMAIL_KEYS].includes(k as typeof EMAIL_KEYS[number]))
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of submittedKeys) {
      const isSecret = (SECRET_KEYS as readonly string[]).includes(k)
      changes[k] = {
        from: isSecret ? "***" : (existing[k] ?? null),
        to:   isSecret ? "***" : (body[k] ?? null),
      }
    }

    await recordActivity({
      session,
      action: "settings.email_update",
      targetType: "settings",
      metadata: { changes },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[settings/email PUT]", err)
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 })
  }
}
