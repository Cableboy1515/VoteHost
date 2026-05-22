import { Resend } from "resend"
import { BRAND_NAME } from "@/lib/branding"
import nodemailer from "nodemailer"
import { db } from "@/lib/db"
import { absolutizeUrl } from "@/lib/absolutize-url"
import { generateVoterToken } from "@/lib/voterToken"

const ALL_KEYS = [
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

type ResendConfig = {
  provider: "resend"
  apiKey: string
  fromAddress: string
  fromName: string
}

type SmtpConfig = {
  provider: "smtp"
  host: string
  port: number
  user: string
  pass: string
  secure: boolean
  fromAddress: string
  fromName: string
}

type EmailConfig = ResendConfig | SmtpConfig

async function getAllEmailConfig(): Promise<EmailConfig> {
  const rows = await db.setting.findMany({ where: { key: { in: [...ALL_KEYS] } } })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value

  const fromAddress = map.email_from_address || "onboarding@resend.dev"
  const fromName = map.email_from_name || BRAND_NAME

  if ((map.email_provider ?? "resend") === "smtp") {
    return {
      provider: "smtp",
      host: map.smtp_host ?? "",
      port: parseInt(map.smtp_port || "587", 10) || 587,
      user: map.smtp_user ?? "",
      pass: map.smtp_pass ?? "",
      secure: map.smtp_secure === "true",
      fromAddress,
      fromName,
    }
  }

  return {
    provider: "resend",
    apiKey: map.resend_api_key || process.env.RESEND_API_KEY || "",
    fromAddress,
    fromName,
  }
}

export async function isEmailConfigured(): Promise<boolean> {
  const rows = await db.setting.findMany({ where: { key: { in: [...ALL_KEYS] } } })
  const map: Record<string, string> = {}
  for (const row of rows) map[row.key] = row.value
  if ((map.email_provider ?? "resend") === "smtp") {
    return !!(map.smtp_host && map.smtp_user && map.smtp_pass)
  }
  return !!(map.resend_api_key || process.env.RESEND_API_KEY)
}

export type EmailMode = "invite" | "reminder-early" | "reminder-final" | "results"

export type ResultsQuestion = {
  questionText: string
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"
  options?: Array<{ optionText: string; count: number; pct: number; winner: boolean }>
  writeInCount?: number
}

export type Payload = {
  voterName: string
  voterEmail: string
  electionTitle: string
  magicLink: string
  emailSubject?: string | null
  emailMessage?: string | null
  emailLogoUrl?: string | null
  emailFooter?: string | null
  /** ISO string for the election close date, used in invite callout + reminder pill */
  endsAt?: string | null
  /** Days remaining for reminder-early pill (e.g. 3) */
  daysLeft?: number | null
  /** Current voter count who have voted, for reminder turnout block */
  votedCount?: number | null
  /** Total voter count, for reminder turnout block */
  totalVoters?: number | null
  /** Compiled results summary for the results announcement email */
  results?: {
    totalVoters: number
    votedCount: number
    turnoutPct: number
    questions: ResultsQuestion[]
  } | null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatCloseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  })
}

function buildSubject(mode: EmailMode, customSubject: string | null | undefined, electionTitle: string): string {
  if (mode === "invite") {
    return customSubject || `You're invited to vote: ${electionTitle}`
  }
  if (mode === "reminder-early") {
    return customSubject
      ? `Reminder: ${customSubject}`
      : `Reminder — you haven't voted yet: ${electionTitle}`
  }
  if (mode === "results") {
    return `Results: ${electionTitle}`
  }
  return customSubject
    ? `Closing in 24 hours: ${customSubject}`
    : `Closing in 24 hours: ${electionTitle}`
}

// Hex values for email clients that don't support oklch or CSS variables
const C = {
  ink: "#1d2338",
  inkSoft: "#374060",
  muted: "#6b7192",
  line: "#e4e6f0",
  bg: "#f8f9fc",
  surface: "#ffffff",
  surface2: "#f2f3f9",
  surface3: "#eaecf4",
  accent: "#3F66D9",
  accentStrong: "#2D4DBA",
  accentSoft: "#EEF2FC",
  success: "#1a8f60",
  successSoft: "#eaf6f0",
  danger: "#dc2626",
  dangerSoft: "#fef2f2",
  warnSoft: "#fef4e0",
  warnText: "#7d4a00",
}

function emailWrapper(content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${BRAND_NAME}</title></head><body style="margin:0;padding:0;background:${C.bg};-webkit-font-smoothing:antialiased;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${C.bg};padding:32px 16px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="560" style="max-width:560px;width:100%;background:${C.surface};border-radius:12px;overflow:hidden;border:1px solid ${C.line};">
${content}
</table>
</td></tr>
</table>
</body></html>`
}

function brandRow(): string {
  const logoSrc = absolutizeUrl("/email-logo.png")
  return `<tr><td style="padding:24px 32px 0;">
  <img src="${logoSrc}" alt="${BRAND_NAME}" height="28" style="display:block;height:28px;width:auto;border:0;outline:none;text-decoration:none;" />
</td></tr>`
}

function footerRow(emailFooter?: string | null): string {
  return `<tr><td style="padding:0 32px 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
    <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
      🔒 This link is unique to you and works once. Your ballot is encrypted and not linked to your identity. Don't share this email.
      ${emailFooter ? `<br><br>${escapeHtml(emailFooter)}` : ""}
    </td>
  </tr></table>
</td></tr>`
}

function logoRow(url?: string | null): string {
  return url
    ? `<tr><td style="padding:24px 32px 0;"><img src="${escapeHtml(absolutizeUrl(url))}" alt="" style="max-width:100%;display:block;border-radius:8px;" /></td></tr>`
    : ""
}

function buildInviteHtml(p: Payload): string {
  const title = escapeHtml(p.electionTitle)
  const name = escapeHtml(p.voterName)
  const link = escapeHtml(p.magicLink)

  const closingCallout = p.endsAt
    ? `<tr><td style="padding:0 32px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 18px;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;color:${C.muted};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:5px;">Voting closes</div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:500;color:${C.ink};">${formatCloseDate(p.endsAt)}</div>
          </td>
        </tr></table>
      </td></tr>`
    : ""

  const customMsg = p.emailMessage
    ? `<tr><td style="padding:0 32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">${escapeHtml(p.emailMessage)}</td></tr>`
    : ""

  return emailWrapper(`
    ${brandRow()}
    ${logoRow(p.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">You're invited to vote</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${BRAND_NAME}</strong> is holding an election: <strong style="color:${C.ink};">${title}</strong>.
      </p>
    </td></tr>
    ${customMsg}
    ${closingCallout}
    <tr><td style="padding:0 32px 14px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Cast your ballot →</a>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};">Or paste this link into your browser:</p>
      <div style="font-family:'Courier New',Courier,monospace;font-size:12px;color:${C.accentStrong};word-break:break-all;">${link}</div>
    </td></tr>
    ${footerRow(p.emailFooter)}
  `)
}

function buildReminderEarlyHtml(p: Payload): string {
  const title = escapeHtml(p.electionTitle)
  const name = escapeHtml(p.voterName)
  const link = escapeHtml(p.magicLink)
  const days = p.daysLeft ?? null
  const closeStr = p.endsAt ? formatCloseDate(p.endsAt) : null

  const pct = p.totalVoters && p.totalVoters > 0 && p.votedCount != null
    ? Math.round((p.votedCount / p.totalVoters) * 100)
    : null

  const turnoutBlock = pct != null && p.totalVoters != null && p.votedCount != null
    ? `<tr><td style="padding:0 32px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="background:${C.bg};border-radius:10px;padding:16px 18px;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
              <td>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};margin-bottom:4px;">Turnout so far</div>
                <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:600;color:${C.ink};">${p.votedCount} of ${p.totalVoters} · ${pct}%</div>
              </td>
              <td width="60" align="right">
                <div style="width:52px;height:52px;border-radius:50%;background:conic-gradient(${C.accent} 0% ${pct}%,${C.surface3} ${pct}% 100%);display:inline-block;vertical-align:middle;position:relative;">
                  <div style="position:absolute;top:7px;left:7px;width:38px;height:38px;border-radius:50%;background:${C.bg};display:flex;align-items:center;justify-content:center;">
                    <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;color:${C.ink};">${pct}%</span>
                  </div>
                </div>
              </td>
            </tr></table>
          </td>
        </tr></table>
      </td></tr>`
    : ""

  return emailWrapper(`
    ${brandRow()}
    ${logoRow(p.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <div style="display:inline-block;background:${C.warnSoft};color:${C.warnText};padding:5px 12px;border-radius:99px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;margin-bottom:16px;">
        ⏰ ${days != null ? `${days} day${days !== 1 ? "s" : ""} left` : "Closing soon"}
      </div>
      <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">You haven't voted yet</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        Just a friendly reminder — the <strong style="color:${C.ink};">${title}</strong> is closing${closeStr ? ` on <strong style="color:${C.ink};">${closeStr}</strong>` : " soon"}. It only takes a few minutes.
      </p>
    </td></tr>
    ${turnoutBlock}
    <tr><td style="padding:0 32px 20px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Vote now →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          Already voted? Ignore this — reminders stop automatically once your ballot is in.
          ${p.emailFooter ? `<br><br>${escapeHtml(p.emailFooter)}` : ""}
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildReminderFinalHtml(p: Payload): string {
  const title = escapeHtml(p.electionTitle)
  const name = escapeHtml(p.voterName)
  const link = escapeHtml(p.magicLink)
  const closeStr = p.endsAt ? formatCloseDate(p.endsAt) : null

  return emailWrapper(`
    ${brandRow()}
    ${logoRow(p.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <div style="display:inline-block;background:${C.dangerSoft};color:${C.danger};padding:5px 12px;border-radius:99px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;margin-bottom:16px;">
        ⏰ Closing in 24 hours
      </div>
      <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Don't miss your chance to vote</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        This is your last chance — the <strong style="color:${C.ink};">${title}</strong> closes${closeStr ? ` on <strong style="color:${C.ink};">${closeStr}</strong>` : " in less than 24 hours"}.
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px 20px;">
      <a href="${link}" style="display:inline-block;background:${C.danger};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Vote before it closes →</a>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};">Or paste this link into your browser:</p>
      <div style="font-family:'Courier New',Courier,monospace;font-size:12px;color:${C.accentStrong};word-break:break-all;">${link}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          🔒 This link is unique to you. Don't share this email.
          ${p.emailFooter ? `<br><br>${escapeHtml(p.emailFooter)}` : ""}
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildResultsHtml(p: Payload): string {
  const title = escapeHtml(p.electionTitle)
  const closeStr = p.endsAt ? formatCloseDate(p.endsAt) : null
  const r = p.results

  const turnoutBlock = r
    ? `<tr><td style="padding:0 32px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
          <td style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:16px 20px;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;color:${C.muted};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px;">Final turnout</div>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};font-variant-numeric:tabular-nums;margin-bottom:10px;">${r.votedCount} of ${r.totalVoters} · ${r.turnoutPct}%</div>
            <div style="height:6px;background:${C.surface3};border-radius:999px;overflow:hidden;">
              <div style="width:${r.turnoutPct}%;height:100%;background:${C.success};border-radius:999px;"></div>
            </div>
          </td>
        </tr></table>
      </td></tr>`
    : ""

  const questionSections = (r?.questions ?? []).map((q, qi) => {
    const qLabel = escapeHtml(q.questionText)

    if (q.type === "WRITE_IN") {
      return `<tr><td style="padding:0 32px ${qi < (r?.questions.length ?? 1) - 1 ? "20px" : "8px"};">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${C.ink};margin-bottom:6px;">${qLabel}</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${C.muted};">${q.writeInCount ?? 0} written-in response${(q.writeInCount ?? 0) !== 1 ? "s" : ""} received.</div>
      </td></tr>`
    }

    const optionRows = (q.options ?? []).map((opt) => {
      const barColor = opt.winner ? C.accent : "#7d92b0"
      const label = escapeHtml(opt.optionText)
      return `<div style="margin-bottom:8px;">
        <div style="display:table;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;margin-bottom:4px;">
          <div style="display:table-cell;font-weight:${opt.winner ? 600 : 400};color:${C.ink};">${label}</div>
          <div style="display:table-cell;text-align:right;color:${C.muted};font-variant-numeric:tabular-nums;">${opt.pct}%</div>
        </div>
        <div style="height:6px;background:${C.surface3};border-radius:999px;overflow:hidden;">
          <div style="width:${opt.pct}%;height:100%;background:${barColor};border-radius:999px;"></div>
        </div>
      </div>`
    }).join("")

    return `<tr><td style="padding:0 32px ${qi < (r?.questions.length ?? 1) - 1 ? "20px" : "8px"};">
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${C.ink};margin-bottom:10px;">${qLabel}</div>
      ${optionRows}
    </td></tr>`
  }).join("")

  return emailWrapper(`
    ${brandRow()}
    ${logoRow(p.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">The results are in</h1>
      <p style="margin:0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        ${escapeHtml(title)} has closed. Here's a summary of how everyone voted.
      </p>
    </td></tr>
    ${turnoutBlock}
    ${questionSections}
    <tr><td style="padding:16px 32px 24px;">
      <hr style="border:none;border-top:1px solid ${C.line};margin:0 0 18px;" />
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};line-height:1.6;">Thank you to everyone who participated.</p>
    </td></tr>
  `)
}

function buildHtml(payload: Payload, mode: EmailMode): string {
  if (mode === "reminder-early") return buildReminderEarlyHtml(payload)
  if (mode === "reminder-final") return buildReminderFinalHtml(payload)
  if (mode === "results") return buildResultsHtml(payload)
  return buildInviteHtml(payload)
}

export type SendClassification = "ok" | "quota" | "transient" | "permanent"

export function classifySendError(provider: "resend" | "smtp", err: unknown): SendClassification {
  if (provider === "resend") {
    const e = err as { name?: string; statusCode?: number; message?: string }
    if (e?.name === "rate_limit_exceeded" || e?.statusCode === 429) return "quota"
    if (e?.statusCode === 403 && /quota|limit/i.test(e?.message ?? "")) return "quota"
    if (e?.statusCode != null && e.statusCode >= 500) return "transient"
    if (e?.statusCode === 422 || e?.name === "validation_error") return "permanent"
    return "transient"
  }
  // SMTP via nodemailer: err has responseCode (number) and response (string).
  // Note: some relays silently accept then drop messages — those cannot be
  // detected here and will appear as "ok" to the caller.
  const e = err as { responseCode?: number; response?: string; message?: string }
  const text = `${e?.response ?? ""} ${e?.message ?? ""}`
  if (e?.responseCode === 421 || /quota|rate limit|too many|exceeded|throttle/i.test(text)) return "quota"
  if (e?.responseCode != null) {
    const code = e.responseCode
    if (code >= 500 && code < 600) return /^55[0-4]/.test(String(code)) ? "permanent" : "transient"
    if (code >= 400 && code < 500) return "transient"
  }
  return "transient"
}

async function sendViaResend(config: ResendConfig, payload: Payload, mode: EmailMode): Promise<{ error: string | null; classification: SendClassification }> {
  try {
    const resend = new Resend(config.apiKey)
    const { error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: payload.voterEmail,
      subject: buildSubject(mode, payload.emailSubject, payload.electionTitle),
      html: buildHtml(payload, mode),
    })
    if (error) return { error: String(error), classification: classifySendError("resend", error) }
    return { error: null, classification: "ok" }
  } catch (err) {
    return { error: String(err), classification: classifySendError("resend", err) }
  }
}

async function sendViaSmtp(config: SmtpConfig, payload: Payload, mode: EmailMode): Promise<{ error: string | null; classification: SendClassification }> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    })
    await transporter.sendMail({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: payload.voterEmail,
      subject: buildSubject(mode, payload.emailSubject, payload.electionTitle),
      html: buildHtml(payload, mode),
    })
    return { error: null, classification: "ok" }
  } catch (err) {
    return { error: String(err), classification: classifySendError("smtp", err) }
  }
}

export async function sendBallotInvitation(payload: Payload, mode: EmailMode = "invite"): Promise<{ error: string | null; classification: SendClassification }> {
  const config = await getAllEmailConfig()
  if (config.provider === "smtp") return sendViaSmtp(config, payload, mode)
  return sendViaResend(config, payload, mode)
}

export type AdminInvitePayload = {
  recipientEmail: string
  setupLink: string
}

function buildAdminInviteHtml(p: AdminInvitePayload): string {
  const email = escapeHtml(p.recipientEmail)
  const link = escapeHtml(p.setupLink)
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">You've been added to ${BRAND_NAME}</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        An administrator has created an account for <strong style="color:${C.ink};">${email}</strong> on <strong style="color:${C.ink};">${BRAND_NAME}</strong>.
        Click below to choose a password and finish setting up your account.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Set up my account →</a>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};">Or paste this link into your browser:</p>
      <div style="font-family:'Courier New',Courier,monospace;font-size:12px;color:${C.accentStrong};word-break:break-all;">${link}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          🔒 This setup link expires in 7 days. If you didn't expect this email, you can ignore it.
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildPasswordResetLinkHtml(recipientEmail: string, resetLink: string, expiresAt: Date): string {
  const email = escapeHtml(recipientEmail)
  const link = escapeHtml(resetLink)
  const expiry = expiresAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Reset your password</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        We received a password reset request for <strong style="color:${C.ink};">${email}</strong>.
        Click below to choose a new password.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Reset my password →</a>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};">Or paste this link into your browser:</p>
      <div style="font-family:'Courier New',Courier,monospace;font-size:12px;color:${C.accentStrong};word-break:break-all;">${link}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          🔒 This link expires at ${expiry}. If you didn't request a password reset, you can safely ignore this email — your password has not changed.
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildPasswordChangedNoticeHtml(recipientEmail: string, changedAt: Date): string {
  const email = escapeHtml(recipientEmail)
  const when = changedAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Your password was changed</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        The password for <strong style="color:${C.ink};">${email}</strong> was changed on <strong style="color:${C.ink};">${when}</strong>.
      </p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        If you made this change, no action is needed. If you didn't, contact your administrator immediately.
      </p>
    </td></tr>
  `)
}

function buildPasswordResetActivityHtml(event: "requested" | "completed", requesterEmail: string, occurredAt: Date): string {
  const email = escapeHtml(requesterEmail)
  const when = occurredAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
  const verb = event === "requested" ? "requested" : "completed"
  const usersUrl = escapeHtml(absolutizeUrl("/users"))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Password reset ${verb}</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        A password reset was <strong style="color:${C.ink};">${verb}</strong> for account <strong style="color:${C.ink};">${email}</strong> at ${when}.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${usersUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">View Users →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because password reset notifications are enabled on this ${BRAND_NAME} installation.
        </td>
      </tr></table>
    </td></tr>
  `)
}

async function sendRawEmail(
  config: EmailConfig,
  to: string,
  subject: string,
  html: string,
): Promise<{ error: string | null }> {
  try {
    if (config.provider === "smtp") {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
      })
      await transporter.sendMail({ from: `${config.fromName} <${config.fromAddress}>`, to, subject, html })
    } else {
      const resend = new Resend(config.apiKey)
      const { error } = await resend.emails.send({ from: `${config.fromName} <${config.fromAddress}>`, to, subject, html })
      if (error) return { error: String(error) }
    }
    return { error: null }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function sendAdminInvite(payload: AdminInvitePayload): Promise<{ error: string | null }> {
  const config = await getAllEmailConfig()
  return sendRawEmail(
    config,
    payload.recipientEmail,
    `You've been added to ${BRAND_NAME} — set up your account`,
    buildAdminInviteHtml(payload),
  )
}

export async function sendPasswordResetLink(payload: {
  recipientEmail: string
  resetLink: string
  expiresAt: Date
}): Promise<{ error: string | null }> {
  const config = await getAllEmailConfig()
  return sendRawEmail(
    config,
    payload.recipientEmail,
    `Reset your ${BRAND_NAME} password`,
    buildPasswordResetLinkHtml(payload.recipientEmail, payload.resetLink, payload.expiresAt),
  )
}

export async function sendPasswordChangedNotice(payload: {
  recipientEmail: string
  changedAt: Date
}): Promise<void> {
  const config = await getAllEmailConfig()
  const result = await sendRawEmail(
    config,
    payload.recipientEmail,
    `Your ${BRAND_NAME} password was changed`,
    buildPasswordChangedNoticeHtml(payload.recipientEmail, payload.changedAt),
  )
  if (result.error) console.error("[sendPasswordChangedNotice] failed:", result.error)
}

export async function sendPasswordResetActivityToAdmins(payload: {
  event: "requested" | "completed"
  requesterEmail: string
  occurredAt: Date
}): Promise<void> {
  const config = await getAllEmailConfig()
  const admins = await db.adminUser.findMany({ where: { role: "ADMIN" }, select: { email: true } })
  if (admins.length === 0) return
  const subject = `Password reset ${payload.event} — ${BRAND_NAME}`
  const html = buildPasswordResetActivityHtml(payload.event, payload.requesterEmail, payload.occurredAt)
  const results = await Promise.allSettled(admins.map((a) => sendRawEmail(config, a.email, subject, html)))
  let failed = 0
  results.forEach((r) => { if (r.status === "rejected" || r.value.error !== null) failed++ })
  if (failed > 0) console.error(`[sendPasswordResetActivityToAdmins] ${failed}/${admins.length} failed`)
}

type BallotResetVoter = { name: string; email: string; magicLink: string }
type BallotResetElection = { title: string; emailLogoUrl: string | null; emailFooter: string | null }

function buildBallotResetHtml(voter: BallotResetVoter, election: BallotResetElection): string {
  const name = escapeHtml(voter.name)
  const title = escapeHtml(election.title)
  const link = escapeHtml(voter.magicLink)
  return emailWrapper(`
    ${brandRow()}
    ${logoRow(election.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Please recast your vote</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        The ballot for <strong style="color:${C.ink};">${title}</strong> was updated after you voted.
        Your previous vote was not counted. Please use the button below to open your ballot and vote again.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Cast your vote →</a>
    </td></tr>
    ${footerRow(election.emailFooter)}
  `)
}

function buildBallotResetAdminHtml(electionTitle: string, organizerEmail: string, voterCount: number, reason: string): string {
  const title = escapeHtml(electionTitle)
  const organizer = escapeHtml(organizerEmail)
  const reasonHtml = escapeHtml(reason)
  const resultsUrl = escapeHtml(absolutizeUrl("/elections"))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Ballot reset</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${organizer}</strong> discarded all votes and reopened the ballot for
        <strong style="color:${C.ink};">${title}</strong>.
        ${voterCount} voter${voterCount !== 1 ? "s" : ""} who had already voted ${voterCount !== 1 ? "were" : "was"} notified by email to recast.
      </p>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">Reason:</strong> ${reasonHtml}
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${resultsUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">View Elections →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you are an administrator on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export async function sendBallotResetNotices(voters: BallotResetVoter[], election: BallotResetElection): Promise<void> {
  if (voters.length === 0) return
  const config = await getAllEmailConfig()
  const subject = `Important — please recast your vote for ${election.title}`
  const results = await Promise.allSettled(
    voters.map((v) => sendRawEmail(config, v.email, subject, buildBallotResetHtml(v, election)))
  )
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = voters[i].email
    if (result.status === "rejected") {
      console.error(`[sendBallotResetNotices] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[sendBallotResetNotices] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[sendBallotResetNotices] election=${election.title} sent=${sent} failed=${failed}`)
}

export async function sendBallotResetAdminNotice(electionTitle: string, organizerEmail: string, voterCount: number, reason: string): Promise<void> {
  const config = await getAllEmailConfig()
  const admins = await db.adminUser.findMany({ where: { role: "ADMIN" }, select: { email: true } })
  if (admins.length === 0) return
  const subject = `Ballot reset — ${electionTitle}`
  const html = buildBallotResetAdminHtml(electionTitle, organizerEmail, voterCount, reason)
  const results = await Promise.allSettled(admins.map((a) => sendRawEmail(config, a.email, subject, html)))
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = admins[i].email
    if (result.status === "rejected") {
      console.error(`[sendBallotResetAdminNotice] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[sendBallotResetAdminNotice] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[sendBallotResetAdminNotice] election=${electionTitle} sent=${sent} failed=${failed}`)
}

// ─── Staff lifecycle notifications (closing-soon, completed, draft-reminder) ────

type StaffElection = { id: string; title: string; endsAt?: Date | null; startsAt?: Date | null }

function buildClosingSoonStaffHtml(election: StaffElection, votedCount: number, totalVoters: number): string {
  const title = escapeHtml(election.title)
  const closeStr = election.endsAt ? escapeHtml(formatCloseDate(election.endsAt.toISOString())) : ""
  const dashUrl = escapeHtml(absolutizeUrl("/dashboard"))
  const turnoutLine = totalVoters > 0
    ? `<strong style="color:${C.ink};">${votedCount}</strong> of <strong style="color:${C.ink};">${totalVoters}</strong> voters have cast a ballot so far.`
    : `No voters have been added yet.`
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Election closing in 24 hours</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${title}</strong> closes ${closeStr ? `on ${closeStr}` : "tomorrow"}.
        ${turnoutLine}
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${dashUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Open Dashboard →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildCompletedStaffHtml(election: StaffElection, votedCount: number, totalVoters: number): string {
  const title = escapeHtml(election.title)
  const resultsUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}/results`))
  const turnoutPct = totalVoters > 0 ? Math.round((votedCount / totalVoters) * 100) : 0
  const turnoutLine = totalVoters > 0
    ? `<strong style="color:${C.ink};">${votedCount}</strong> of <strong style="color:${C.ink};">${totalVoters}</strong> voters cast a ballot (<strong style="color:${C.ink};">${turnoutPct}%</strong> turnout).`
    : `No voters were recorded for this election.`
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Election closed</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${title}</strong> has closed. ${turnoutLine}
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${resultsUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">View Results →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildDraftReminderStaffHtml(election: StaffElection): string {
  const title = escapeHtml(election.title)
  const startStr = election.startsAt ? escapeHtml(formatCloseDate(election.startsAt.toISOString())) : ""
  const editUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}`))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Election scheduled to start in 24 hours</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${title}</strong> is scheduled to start ${startStr ? `on ${startStr}` : "soon"}, but it is still in <strong style="color:${C.ink};">DRAFT</strong>.
        Voters will not receive invitations until you publish it.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${editUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Open Election →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

async function sendStaffBlast(
  label: string,
  electionTitle: string,
  recipients: Array<{ email: string }>,
  subject: string,
  html: string,
): Promise<void> {
  if (recipients.length === 0) {
    console.warn(`[${label}] No staff recipients found — election=${electionTitle}`)
    return
  }
  const config = await getAllEmailConfig()
  const results = await Promise.allSettled(recipients.map((r) => sendRawEmail(config, r.email, subject, html)))
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = recipients[i].email
    if (result.status === "rejected") {
      console.error(`[${label}] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[${label}] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[${label}] election=${electionTitle} sent=${sent} failed=${failed}`)
}

export async function sendElectionClosingSoonStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
  votedCount: number,
  totalVoters: number,
): Promise<void> {
  const subject = `Closing in 24h — ${election.title}`
  const html = buildClosingSoonStaffHtml(election, votedCount, totalVoters)
  await sendStaffBlast("sendElectionClosingSoonStaffNotice", election.title, recipients, subject, html)
}

export async function sendElectionCompletedStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
  votedCount: number,
  totalVoters: number,
): Promise<void> {
  const subject = `Election closed — ${election.title}`
  const html = buildCompletedStaffHtml(election, votedCount, totalVoters)
  await sendStaffBlast("sendElectionCompletedStaffNotice", election.title, recipients, subject, html)
}

export async function sendDraftReminderStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
): Promise<void> {
  const subject = `Reminder: publish "${election.title}" — starts in 24h`
  const html = buildDraftReminderStaffHtml(election)
  await sendStaffBlast("sendDraftReminderStaffNotice", election.title, recipients, subject, html)
}

function buildFullTurnoutStaffHtml(election: StaffElection, voted: number, invited: number): string {
  const title = escapeHtml(election.title)
  const electionUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}`))
  const closeNote = election.endsAt
    ? `You can close it now to finalize results, or let it run until it closes on ${escapeHtml(formatCloseDate(election.endsAt.toISOString()))}.`
    : `You can close it now to finalize results, or wait until you close it manually.`
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">All voters have cast their ballots</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        All <strong style="color:${C.ink};">${invited} invited voter${invited !== 1 ? "s" : ""}</strong> have voted in
        <strong style="color:${C.ink};">${title}</strong>.
        ${closeNote}
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${electionUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Open Election →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export type BallotReceiptPayload = {
  voterName: string
  voterEmail: string
  electionTitle: string
  receiptCode: string
  electionId: string
}

function buildBallotReceiptHtml(p: BallotReceiptPayload): string {
  const name = escapeHtml(p.voterName)
  const title = escapeHtml(p.electionTitle)
  const code = escapeHtml(p.receiptCode)
  const verifyUrl = escapeHtml(absolutizeUrl(`/verify/${p.electionId}`))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Your ballot receipt</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        Your vote in <strong style="color:${C.ink};">${title}</strong> has been recorded. Save the receipt code below to verify your ballot was counted.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="background:${C.accentSoft};border:1px solid oklch(0.85 0.05 255);border-radius:10px;padding:18px 20px;text-align:center;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;color:${C.muted};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">Receipt code</div>
          <div style="font-family:'Courier New',Courier,monospace;font-size:22px;font-weight:700;color:${C.ink};letter-spacing:0.1em;">${code}</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${verifyUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:500;">Verify my ballot →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          This code does not reveal what you voted for. It only proves your ballot was recorded.
          Anyone can enter this code on the verification page to confirm it exists in the election ledger.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export async function sendBallotReceipt(payload: BallotReceiptPayload): Promise<{ error: string | null }> {
  const config = await getAllEmailConfig()
  return sendRawEmail(
    config,
    payload.voterEmail,
    `Your ballot receipt — ${payload.electionTitle}`,
    buildBallotReceiptHtml(payload),
  )
}

export async function sendFullTurnoutStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
  voted: number,
  invited: number,
): Promise<void> {
  const subject = `All voters have voted — ${election.title}`
  const html = buildFullTurnoutStaffHtml(election, voted, invited)
  await sendStaffBlast("sendFullTurnoutStaffNotice", election.title, recipients, subject, html)
}

function buildAutoActivateFailedStaffHtml(
  election: StaffElection,
  reason: "no_ballot" | "no_voters" | "past_endsAt",
): string {
  const title = escapeHtml(election.title)
  const editUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}`))
  const votersUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}/voters`))
  const ballotUrl = escapeHtml(absolutizeUrl(`/elections/${election.id}/ballot`))
  const reasonMessages: Record<typeof reason, string> = {
    no_ballot: `The ballot has no races. <a href="${ballotUrl}" style="color:${C.accent};">Add at least one race</a> to the ballot.`,
    no_voters: `There are no voters. <a href="${votersUrl}" style="color:${C.accent};">Add at least one voter</a> before the system can open voting.`,
    past_endsAt: `The scheduled close date has already passed. Update it on the <a href="${editUrl}" style="color:${C.accent};">settings page</a>.`,
  }
  const startStr = election.startsAt ? escapeHtml(formatCloseDate(election.startsAt.toISOString())) : "its scheduled start time"
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Election failed to auto-start</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${title}</strong> was scheduled to open at ${startStr}, but could not start automatically.
      </p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        ${reasonMessages[reason]}
      </p>
    </td></tr>
    <tr><td style="padding:16px 32px 14px;">
      <a href="${editUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Open Election →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export async function sendAutoActivateFailedStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
  reason: "no_ballot" | "no_voters" | "past_endsAt",
): Promise<void> {
  const subject = `Action required: "${election.title}" failed to auto-start`
  const html = buildAutoActivateFailedStaffHtml(election, reason)
  await sendStaffBlast("sendAutoActivateFailedStaffNotice", election.title, recipients, subject, html)
}

// ─── Activation cancellation notices ────────────────────────────────────────

type ActivationCancelledVoter = { name: string; email: string }

function buildActivationCancelledVoterHtml(voter: ActivationCancelledVoter, electionTitle: string): string {
  const name = escapeHtml(voter.name)
  const title = escapeHtml(electionTitle)
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Voting postponed</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        Voting on <strong style="color:${C.ink};">${title}</strong> has been postponed. You will receive a new invitation when voting reopens — please disregard your prior invitation until then.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          No action is needed on your part. We apologize for the inconvenience.
        </td>
      </tr></table>
    </td></tr>
  `)
}

function buildActivationCancelledAdminHtml(electionTitle: string, organizerEmail: string, notifiedCount: number): string {
  const title = escapeHtml(electionTitle)
  const organizer = escapeHtml(organizerEmail)
  const electionsUrl = escapeHtml(absolutizeUrl("/elections"))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Activation cancelled</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${organizer}</strong> cancelled the activation of
        <strong style="color:${C.ink};">${title}</strong> and returned it to Draft status.
        ${notifiedCount > 0
          ? `${notifiedCount} invited voter${notifiedCount !== 1 ? "s" : ""} received a postponement notice.`
          : "No voters had been invited yet."}
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${electionsUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">View Elections →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you are an administrator on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export async function sendActivationCancelledVoterNotices(voters: ActivationCancelledVoter[], electionTitle: string): Promise<void> {
  if (voters.length === 0) return
  const config = await getAllEmailConfig()
  const subject = `Voting postponed — ${electionTitle}`
  const results = await Promise.allSettled(
    voters.map((v) => sendRawEmail(config, v.email, subject, buildActivationCancelledVoterHtml(v, electionTitle)))
  )
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = voters[i].email
    if (result.status === "rejected") {
      console.error(`[sendActivationCancelledVoterNotices] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[sendActivationCancelledVoterNotices] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[sendActivationCancelledVoterNotices] election=${electionTitle} sent=${sent} failed=${failed}`)
}

export async function sendActivationCancelledAdminNotice(electionTitle: string, organizerEmail: string, notifiedCount: number): Promise<void> {
  const config = await getAllEmailConfig()
  const admins = await db.adminUser.findMany({ where: { role: "ADMIN" }, select: { email: true } })
  if (admins.length === 0) return
  const subject = `Activation cancelled — ${electionTitle}`
  const html = buildActivationCancelledAdminHtml(electionTitle, organizerEmail, notifiedCount)
  const results = await Promise.allSettled(admins.map((a) => sendRawEmail(config, a.email, subject, html)))
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = admins[i].email
    if (result.status === "rejected") {
      console.error(`[sendActivationCancelledAdminNotice] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[sendActivationCancelledAdminNotice] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[sendActivationCancelledAdminNotice] election=${electionTitle} sent=${sent} failed=${failed}`)
}

// ─── Election deadline extended notices ─────────────────────────────────────

type ExtendedVoterInfo = { id: string; name: string; email: string }

function buildElectionExtendedVoterHtml(
  voter: ExtendedVoterInfo,
  election: { title: string; emailLogoUrl?: string | null; emailFooter?: string | null },
  newEndsAt: string,
  magicLink: string,
): string {
  const name = escapeHtml(voter.name)
  const title = escapeHtml(election.title)
  const link = escapeHtml(magicLink)
  const closingCallout = `<tr><td style="padding:0 32px 20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 18px;">
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;color:${C.muted};letter-spacing:0.06em;text-transform:uppercase;margin-bottom:5px;">New voting deadline</div>
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:500;color:${C.ink};">${formatCloseDate(newEndsAt)}</div>
      </td>
    </tr></table>
  </td></tr>`
  return emailWrapper(`
    ${brandRow()}
    ${logoRow(election.emailLogoUrl)}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Voting deadline extended</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">Hi ${name},</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        Good news — the deadline for <strong style="color:${C.ink};">${title}</strong> has been extended. You still have time to cast your ballot.
      </p>
    </td></tr>
    ${closingCallout}
    <tr><td style="padding:0 32px 14px;">
      <a href="${link}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Cast your ballot →</a>
    </td></tr>
    <tr><td style="padding:0 32px 20px;">
      <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:${C.muted};">Or paste this link into your browser:</p>
      <div style="font-family:'Courier New',Courier,monospace;font-size:12px;color:${C.accentStrong};word-break:break-all;">${link}</div>
    </td></tr>
    ${footerRow(election.emailFooter)}
  `)
}

function buildElectionExtendedStaffHtml(
  election: StaffElection,
  oldEndsAt: Date,
  newEndsAt: Date,
  extendedByEmail: string,
): string {
  const title = escapeHtml(election.title)
  const by = escapeHtml(extendedByEmail)
  const dashUrl = escapeHtml(absolutizeUrl("/dashboard"))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Voting deadline extended</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${by}</strong> extended the close date for
        <strong style="color:${C.ink};">${title}</strong>.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="background:${C.bg};border:1px solid ${C.line};border-radius:10px;padding:14px 18px;">
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${C.muted};margin-bottom:6px;">
            <span style="text-decoration:line-through;">${escapeHtml(formatCloseDate(oldEndsAt.toISOString()))}</span>
          </div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;color:${C.ink};">
            ${escapeHtml(formatCloseDate(newEndsAt.toISOString()))}
          </div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:14px 32px 14px;">
      <a href="${dashUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Open Dashboard →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you administer or organize elections on ${BRAND_NAME}.
        </td>
      </tr></table>
    </td></tr>
  `)
}

export async function sendElectionExtendedNoticeToUnvoted(
  electionId: string,
  newEndsAt: Date,
): Promise<void> {
  const election = await db.election.findUnique({
    where: { id: electionId },
    select: { title: true, emailLogoUrl: true, emailFooter: true },
  })
  if (!election) return

  const voters = await db.voter.findMany({
    where: { electionId, hasVoted: false, invitedAt: { not: null } },
    select: { id: true, name: true, email: true },
  })
  if (voters.length === 0) return

  const config = await getAllEmailConfig()
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const subject = `Voting deadline extended — ${election.title}`
  let sent = 0
  let failed = 0

  for (const voter of voters) {
    try {
      const { token, tokenHash } = generateVoterToken()
      await db.voter.update({ where: { id: voter.id }, data: { tokenHash } })
      const magicLink = `${baseUrl}/vote/${token}`
      const html = buildElectionExtendedVoterHtml(voter, election, newEndsAt.toISOString(), magicLink)
      const result = await sendRawEmail(config, voter.email, subject, html)
      if (result.error) {
        console.error(`[sendElectionExtendedNoticeToUnvoted] send failed for ${voter.email}:`, result.error)
        failed++
      } else {
        sent++
      }
    } catch (err) {
      console.error(`[sendElectionExtendedNoticeToUnvoted] threw for ${voter.email}:`, err)
      failed++
    }
  }
  console.log(`[sendElectionExtendedNoticeToUnvoted] election=${election.title} sent=${sent} failed=${failed}`)
}

export async function sendElectionExtendedStaffNotice(
  election: StaffElection,
  recipients: Array<{ email: string }>,
  oldEndsAt: Date,
  newEndsAt: Date,
  extendedByEmail: string,
): Promise<void> {
  const subject = `Voting deadline extended — ${election.title}`
  const html = buildElectionExtendedStaffHtml(election, oldEndsAt, newEndsAt, extendedByEmail)
  await sendStaffBlast("sendElectionExtendedStaffNotice", election.title, recipients, subject, html)
}
