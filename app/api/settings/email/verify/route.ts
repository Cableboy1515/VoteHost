import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/recordActivity"
import {
  verifySmtp,
  verifyResend,
  emailConfigFingerprint,
  persistVerifyResult,
  type VerifyResult,
} from "@/lib/emailVerify"

const SENTINEL = "***"
const SECRET_KEYS = ["smtp_pass", "resend_api_key"] as const

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`email-verify:admin:${session.sub}`, { limit: 10, windowMs: 600_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  // ── Dry-run short-circuit ──────────────────────────────────────────────────
  if (process.env.EMAIL_DRY_RUN) {
    const result: VerifyResult = {
      ok: false,
      code: "dry_run",
      message: "EMAIL_DRY_RUN is enabled — no real connection was attempted.",
      hint: "Unset EMAIL_DRY_RUN in your .env file to verify real credentials.",
    }
    return NextResponse.json(result)
  }

  const body = await req.json().catch(() => ({}))
  const provider: string = body.email_provider ?? "resend"
  const preset: string | undefined = body.email_preset

  // ── Sentinel resolution ────────────────────────────────────────────────────
  async function resolveSecret(field: typeof SECRET_KEYS[number], submitted: string | undefined): Promise<string | null> {
    if (submitted === SENTINEL) {
      const row = await db.setting.findUnique({ where: { key: field } })
      if (!row?.value) return null
      return row.value
    }
    return submitted ?? null
  }

  let result: VerifyResult
  let fingerprint: string

  if (provider === "smtp") {
    const smtpPass = await resolveSecret("smtp_pass", body.smtp_pass)
    if (!smtpPass) {
      return NextResponse.json(
        { ok: false, code: "missing_fields", message: "SMTP password is required." },
        { status: 400 },
      )
    }
    const host: string = body.smtp_host ?? ""
    const port: number = parseInt(body.smtp_port ?? "587", 10) || 587
    const user: string = body.smtp_user ?? ""
    const secure: boolean = body.smtp_secure === "true"

    fingerprint = emailConfigFingerprint({ provider, host, port, user, pass: smtpPass, secure })
    result = await verifySmtp({ host, port, user, pass: smtpPass, secure }, { preset })
  } else {
    // Same env fallback as getAllEmailConfig — sends would use it, so verify it too
    const apiKey = (await resolveSecret("resend_api_key", body.resend_api_key)) || process.env.RESEND_API_KEY || null
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, code: "missing_fields", message: "Resend API key is required." },
        { status: 400 },
      )
    }
    fingerprint = emailConfigFingerprint({ provider, apiKey })
    result = await verifyResend(apiKey)
  }

  // ── Persist result (even on failure) ──────────────────────────────────────
  await persistVerifyResult(result, fingerprint)

  await recordActivity({
    session,
    action: "settings.email_verify",
    targetType: "settings",
    metadata: { provider, ok: result.ok, code: result.code },
  })

  return NextResponse.json(result)
}
