import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { sendBallotInvitation } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { mapSmtpError, mapResendError, emailConfigFingerprint, persistVerifyResult } from "@/lib/emailVerify"
import { db } from "@/lib/db"

export async function POST(req: Request) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`email-test:admin:${session.sub}`, { limit: 5, windowMs: 3_600_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { to } = await req.json().catch(() => ({}))
  if (!to) return NextResponse.json({ error: "Missing recipient email" }, { status: 400 })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  const result = await sendBallotInvitation({
    voterName: "Test Voter",
    voterEmail: to,
    electionTitle: "Test Election",
    magicLink: `${baseUrl}/vote/test-token`,
  })

  if (result.error) {
    console.error("[settings/email/test]", result.error)

    // Enrich the error with a friendly message and hint from the verifier's mapper
    let message = "Failed to send test email — check provider settings"
    let hint: string | undefined
    let code: string | undefined
    let detail: string | undefined

    if (result.provider === "smtp") {
      const rows = await db.setting.findMany({
        where: { key: { in: ["smtp_host", "smtp_port", "smtp_secure", "email_preset"] } },
      })
      const m: Record<string, string> = {}
      for (const r of rows) m[r.key] = r.value

      const syntheticErr = {
        code: result.errorCode ?? undefined,
        responseCode: result.responseCode ? parseInt(result.responseCode, 10) : undefined,
        response: result.responseText ?? undefined,
        message: result.error,
      }
      const mapped = mapSmtpError(syntheticErr, {
        host: m.smtp_host ?? "",
        port: parseInt(m.smtp_port ?? "587", 10) || 587,
        secure: m.smtp_secure === "true",
        preset: m.email_preset,
      })
      message = mapped.message
      hint = mapped.hint
      code = mapped.code
      detail = mapped.detail
    } else {
      const syntheticErr = {
        name: result.responseCode ? undefined : undefined,
        statusCode: result.responseCode ? parseInt(result.responseCode, 10) : undefined,
        message: result.error,
      }
      const mapped = mapResendError(syntheticErr)
      message = mapped.message
      hint = mapped.hint
      code = mapped.code
      detail = mapped.detail
    }

    return NextResponse.json({ error: message, hint, code, detail }, { status: 502 })
  }

  // Success: update the verification badge with the stored config's fingerprint
  try {
    const rows = await db.setting.findMany({
      where: {
        key: {
          in: ["email_provider", "smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_secure", "resend_api_key"],
        },
      },
    })
    const m: Record<string, string> = {}
    for (const r of rows) m[r.key] = r.value

    const provider = m.email_provider ?? "resend"
    const fp =
      provider === "resend"
        ? emailConfigFingerprint({ provider, apiKey: m.resend_api_key ?? "" })
        : emailConfigFingerprint({
            provider,
            host: m.smtp_host ?? "",
            port: m.smtp_port ?? "587",
            user: m.smtp_user ?? "",
            pass: m.smtp_pass ?? "",
            secure: m.smtp_secure ?? "false",
          })

    await persistVerifyResult(
      { ok: true, code: "ok", message: "Verified by successful test send." },
      fp,
    )
  } catch (err) {
    console.error("[settings/email/test] failed to update verification badge:", err)
  }

  return NextResponse.json({ ok: true })
}
