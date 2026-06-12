import crypto from "node:crypto"
import nodemailer from "nodemailer"
import { Resend } from "resend"
import { db } from "@/lib/db"

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerifyErrorCode =
  | "ok"
  | "ok_restricted_key"
  | "dry_run"
  | "missing_fields"
  | "auth_failed"
  | "host_not_found"
  | "connection_refused"
  | "timed_out"
  | "tls_wrong_mode"
  | "tls_cert"
  | "invalid_api_key"
  | "network"
  | "unknown"

export type VerifyResult = {
  ok: boolean
  code: VerifyErrorCode
  message: string
  hint?: string
  detail?: string
}

// ─── Preset-aware auth hints ──────────────────────────────────────────────────

const HOST_AUTH_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  {
    pattern: /smtp\.gmail\.com/i,
    hint: "Gmail requires a 16-character App Password — not your regular password. Generate one at myaccount.google.com/apppasswords (2-Step Verification must be enabled).",
  },
  {
    pattern: /smtp\.mail\.me\.com/i,
    hint: "iCloud requires an app-specific password. Generate one at account.apple.com under Sign-In and Security → App-Specific Passwords.",
  },
  {
    pattern: /smtp\.mail\.yahoo\.com/i,
    hint: "Yahoo requires an App Password. Generate one at login.yahoo.com/account/security → Generate app password.",
  },
  {
    pattern: /smtp\.office365\.com/i,
    hint: "Microsoft 365: use your full email address as the username. If your tenant blocks basic SMTP auth, enable Authenticated SMTP for the mailbox or generate an App Password if MFA is active.",
  },
]

function authHintForHost(host: string, preset?: string): string | undefined {
  // Preset overrides host sniffing when explicitly provided
  if (preset === "gmail") return HOST_AUTH_HINTS[0].hint
  if (preset === "icloud") return HOST_AUTH_HINTS[1].hint
  if (preset === "yahoo") return HOST_AUTH_HINTS[2].hint
  if (preset === "outlook") return HOST_AUTH_HINTS[3].hint
  for (const { pattern, hint } of HOST_AUTH_HINTS) {
    if (pattern.test(host)) return hint
  }
  return undefined
}

// ─── SMTP error mapper ────────────────────────────────────────────────────────

export function mapSmtpError(
  err: unknown,
  ctx: { host: string; port: number; secure: boolean; preset?: string },
): VerifyResult {
  const e = err as {
    code?: string
    responseCode?: number
    response?: string
    message?: string
    cert?: unknown
    reason?: string
  }
  const code = e.code ?? ""
  const responseCode = e.responseCode ?? 0
  const text = `${e.response ?? ""} ${e.message ?? ""}`.toLowerCase()
  const rawDetail = (e.response ?? e.message ?? String(err)).slice(0, 300)

  // Auth failures
  if (
    code === "EAUTH" ||
    responseCode === 535 ||
    responseCode === 534 ||
    responseCode === 530 ||
    /username and password not accepted/i.test(text) ||
    /authentication failed/i.test(text) ||
    /invalid credentials/i.test(text)
  ) {
    // Special-case 534 "application-specific password required" → Gmail hint
    const isGmailAppPass =
      responseCode === 534 || /application.specific password/i.test(text)
    const hint = isGmailAppPass
      ? HOST_AUTH_HINTS[0].hint
      : authHintForHost(ctx.host, ctx.preset)
    return {
      ok: false,
      code: "auth_failed",
      message: "Authentication failed — username or password rejected.",
      hint,
      detail: rawDetail,
    }
  }

  // Host not found
  if (code === "EDNS" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return {
      ok: false,
      code: "host_not_found",
      message: `Could not find server "${ctx.host}" — check for typos.`,
      detail: rawDetail,
    }
  }

  // Connection refused
  if (code === "ECONNREFUSED") {
    return {
      ok: false,
      code: "connection_refused",
      message: `"${ctx.host}" refused the connection on port ${ctx.port}.`,
      detail: rawDetail,
    }
  }

  // Timeout
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "ECONNRESET") {
    // Port 465 with secure=false or port ≠ 465 with no explicit timeout → likely TLS mismatch
    if (!ctx.secure && ctx.port === 465) {
      return {
        ok: false,
        code: "timed_out",
        message: `Connection to "${ctx.host}:${ctx.port}" timed out.`,
        hint: "Port 465 requires Implicit TLS — switch the TLS mode selector to \"Implicit TLS (port 465)\".",
        detail: rawDetail,
      }
    }
    return {
      ok: false,
      code: "timed_out",
      message: `Connection to "${ctx.host}:${ctx.port}" timed out.`,
      hint: "Check the SMTP host and port, and that a firewall isn't blocking outbound connections.",
      detail: rawDetail,
    }
  }

  // TLS version/mode mismatch (trying implicit TLS on a STARTTLS port)
  if (
    code === "ESOCKET" ||
    /wrong version number/i.test(text) ||
    /ssl routines/i.test(text) ||
    /tlsv1 alert/i.test(text)
  ) {
    if (ctx.secure && ctx.port !== 465) {
      return {
        ok: false,
        code: "tls_wrong_mode",
        message: `TLS mode mismatch on port ${ctx.port}.`,
        hint: `Port ${ctx.port} expects STARTTLS — switch the TLS mode selector to "STARTTLS (port 587)".`,
        detail: rawDetail,
      }
    }
    return {
      ok: false,
      code: "tls_wrong_mode",
      message: "TLS negotiation failed — the server's TLS mode may not match the selected option.",
      detail: rawDetail,
    }
  }

  // Certificate errors
  if (
    /certificate/i.test(text) ||
    /self.signed/i.test(text) ||
    /depth zero/i.test(text) ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "CERT_HAS_EXPIRED"
  ) {
    return {
      ok: false,
      code: "tls_cert",
      message: "Server's TLS certificate could not be verified.",
      detail: rawDetail,
    }
  }

  return {
    ok: false,
    code: "unknown",
    message: "Could not connect to the SMTP server.",
    detail: rawDetail,
  }
}

// ─── Resend error mapper ──────────────────────────────────────────────────────

export function mapResendError(err: unknown): VerifyResult {
  const e = err as { name?: string; statusCode?: number; message?: string }
  const name = e.name ?? ""
  const status = e.statusCode ?? 0
  const rawDetail = (e.message ?? String(err)).slice(0, 300)

  if (name === "restricted_api_key") {
    return {
      ok: true,
      code: "ok_restricted_key",
      message: "API key accepted (sending-only key — domain list not accessible, but sends will work).",
    }
  }

  // The SDK reports a malformed/unknown key as validation_error 400 with
  // "API key is invalid" — observed live, not just invalid_api_key/401.
  if (
    name === "invalid_api_key" ||
    name === "missing_api_key" ||
    /api key is invalid/i.test(e.message ?? "") ||
    status === 401 ||
    status === 403
  ) {
    return {
      ok: false,
      code: "invalid_api_key",
      message: "Resend API key is invalid or revoked.",
      hint: "Generate a new key at resend.com/api-keys.",
      detail: rawDetail,
    }
  }

  // Network / connectivity failure (thrown, not a structured error)
  if (
    name === "FetchError" ||
    /fetch/i.test(String(err)) ||
    /network/i.test(String(err)) ||
    /enotfound/i.test(String(err))
  ) {
    return {
      ok: false,
      code: "network",
      message: "Could not reach the Resend API — check your network connection.",
      detail: rawDetail,
    }
  }

  return {
    ok: false,
    code: "unknown",
    message: "Resend API returned an unexpected error.",
    detail: rawDetail,
  }
}

// ─── SMTP verifier ────────────────────────────────────────────────────────────

export async function verifySmtp(
  cfg: { host: string; port: number; user: string; pass: string; secure: boolean },
  opts: { timeoutMs?: number; preset?: string } = {},
): Promise<VerifyResult> {
  const { host, port, user, pass, secure } = cfg
  const timeoutMs = opts.timeoutMs ?? 10_000

  if (!host || !user || !pass) {
    return {
      ok: false,
      code: "missing_fields",
      message: "SMTP host, username, and password are all required.",
    }
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  })

  try {
    await Promise.race([
      transport.verify(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("Hard timeout"), { code: "ETIMEDOUT" })), timeoutMs + 1000)
      ),
    ])
    return { ok: true, code: "ok", message: "Connection verified successfully." }
  } catch (err) {
    return mapSmtpError(err, { host, port, secure, preset: opts.preset })
  } finally {
    transport.close()
  }
}

// ─── Resend verifier ──────────────────────────────────────────────────────────

export async function verifyResend(
  apiKey: string,
  opts: { timeoutMs?: number } = {},
): Promise<VerifyResult> {
  const timeoutMs = opts.timeoutMs ?? 10_000

  if (!apiKey) {
    return { ok: false, code: "missing_fields", message: "Resend API key is required." }
  }

  const resend = new Resend(apiKey)

  try {
    const result = await Promise.race([
      resend.domains.list(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Resend API timeout")), timeoutMs)
      ),
    ])

    const error = (result as { error?: { name?: string; statusCode?: number; message?: string } | null }).error
    if (error) {
      return mapResendError(error)
    }

    return { ok: true, code: "ok", message: "Resend API key verified successfully." }
  } catch (err) {
    const e = err as { name?: string }
    if (e.name === "restricted_api_key") {
      return mapResendError(err)
    }
    return mapResendError(err)
  }
}

// ─── Config fingerprint ───────────────────────────────────────────────────────

export function emailConfigFingerprint(cfg: {
  provider: string
  host?: string
  port?: number | string
  user?: string
  pass?: string
  secure?: boolean | string
  apiKey?: string
}): string {
  const relevant =
    cfg.provider === "resend"
      ? `resend:${cfg.apiKey ?? ""}`
      : `smtp:${cfg.host ?? ""}:${cfg.port ?? ""}:${cfg.user ?? ""}:${cfg.pass ?? ""}:${cfg.secure ?? ""}`

  return crypto.createHash("sha256").update(relevant).digest("hex")
}

// ─── Stored verification helpers ─────────────────────────────────────────────

export type StoredVerification = {
  status: "ok" | "failed"
  verifiedAt: string
  current: boolean
  message?: string
} | null

export async function getStoredVerification(): Promise<StoredVerification> {
  const rows = await db.setting.findMany({
    where: {
      key: {
        in: [
          "email_verify_status",
          "email_verify_at",
          "email_verify_fingerprint",
          "email_verify_message",
          "email_provider",
          "smtp_host",
          "smtp_port",
          "smtp_user",
          "smtp_pass",
          "smtp_secure",
          "resend_api_key",
        ],
      },
    },
  })
  const m: Record<string, string> = {}
  for (const r of rows) m[r.key] = r.value

  const status = m.email_verify_status as "ok" | "failed" | undefined
  const verifiedAt = m.email_verify_at
  const storedFp = m.email_verify_fingerprint

  if (!status || !verifiedAt || !storedFp) return null

  const provider = m.email_provider ?? "resend"
  const currentFp = emailConfigFingerprint(
    provider === "resend"
      ? { provider, apiKey: m.resend_api_key || process.env.RESEND_API_KEY || "" }
      : {
          provider,
          host: m.smtp_host ?? "",
          port: m.smtp_port ?? "587",
          user: m.smtp_user ?? "",
          pass: m.smtp_pass ?? "",
          secure: m.smtp_secure ?? "false",
        },
  )

  return {
    status,
    verifiedAt,
    current: storedFp === currentFp,
    message: m.email_verify_message,
  }
}

export async function persistVerifyResult(
  result: VerifyResult,
  fingerprint: string,
): Promise<void> {
  const now = new Date().toISOString()
  const upserts = [
    db.setting.upsert({
      where: { key: "email_verify_status" },
      update: { value: result.ok || result.code === "ok_restricted_key" ? "ok" : "failed" },
      create: { key: "email_verify_status", value: result.ok || result.code === "ok_restricted_key" ? "ok" : "failed" },
    }),
    db.setting.upsert({
      where: { key: "email_verify_at" },
      update: { value: now },
      create: { key: "email_verify_at", value: now },
    }),
    db.setting.upsert({
      where: { key: "email_verify_fingerprint" },
      update: { value: fingerprint },
      create: { key: "email_verify_fingerprint", value: fingerprint },
    }),
    db.setting.upsert({
      where: { key: "email_verify_message" },
      update: { value: result.message },
      create: { key: "email_verify_message", value: result.message },
    }),
  ]
  await db.$transaction(upserts)
}
