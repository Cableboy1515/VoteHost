import { Resend } from "resend"
import nodemailer from "nodemailer"
import { db } from "@/lib/db"
import { absolutizeUrl } from "@/lib/absolutize-url"

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
  const fromName = map.email_from_name || "VoteHost"

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
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>VoteHost</title></head><body style="margin:0;padding:0;background:${C.bg};-webkit-font-smoothing:antialiased;">
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
  <img src="${logoSrc}" alt="VoteHost Elections" height="28" style="display:block;height:28px;width:auto;border:0;outline:none;text-decoration:none;" />
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
        <strong style="color:${C.ink};">VoteHost</strong> is holding an election: <strong style="color:${C.ink};">${title}</strong>.
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

async function sendViaResend(config: ResendConfig, payload: Payload, mode: EmailMode): Promise<{ error: string | null }> {
  try {
    const resend = new Resend(config.apiKey)
    const { error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: payload.voterEmail,
      subject: buildSubject(mode, payload.emailSubject, payload.electionTitle),
      html: buildHtml(payload, mode),
    })
    return { error: error ? String(error) : null }
  } catch (err) {
    return { error: String(err) }
  }
}

async function sendViaSmtp(config: SmtpConfig, payload: Payload, mode: EmailMode): Promise<{ error: string | null }> {
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
    return { error: null }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function sendBallotInvitation(payload: Payload, mode: EmailMode = "invite"): Promise<{ error: string | null }> {
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
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">You've been added to VoteHost</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        An administrator has created an account for <strong style="color:${C.ink};">${email}</strong> on <strong style="color:${C.ink};">VoteHost</strong>.
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

function buildPasswordResetRequestHtml(requesterEmail: string): string {
  const email = escapeHtml(requesterEmail)
  const usersUrl = escapeHtml(absolutizeUrl("/users"))
  return emailWrapper(`
    ${brandRow()}
    <tr><td style="padding:24px 32px 14px;">
      <h1 style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:22px;font-weight:600;color:${C.ink};letter-spacing:-0.02em;">Password reset requested</h1>
      <p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;color:${C.inkSoft};line-height:1.6;">
        <strong style="color:${C.ink};">${email}</strong> has requested a password reset.
        Visit the Users screen to send them a new setup link.
      </p>
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${usersUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">Go to Users →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you are an administrator on VoteHost.
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
    "You've been added to VoteHost — set up your account",
    buildAdminInviteHtml(payload),
  )
}

export async function sendPasswordResetRequest(requesterEmail: string): Promise<void> {
  const config = await getAllEmailConfig()
  const admins = await db.adminUser.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
  })
  if (admins.length === 0) {
    console.warn("[sendPasswordResetRequest] No ADMIN users found — notification not sent for:", requesterEmail)
    return
  }
  const subject = `Password reset requested — ${requesterEmail}`
  const html = buildPasswordResetRequestHtml(requesterEmail)
  const results = await Promise.allSettled(admins.map((a) => sendRawEmail(config, a.email, subject, html)))
  let sent = 0
  let failed = 0
  results.forEach((result, i) => {
    const recipient = admins[i].email
    if (result.status === "rejected") {
      console.error(`[sendPasswordResetRequest] send threw for ${recipient}:`, result.reason)
      failed++
    } else if (result.value.error !== null) {
      console.error(`[sendPasswordResetRequest] send failed for ${recipient}:`, result.value.error)
      failed++
    } else {
      sent++
    }
  })
  console.log(`[sendPasswordResetRequest] requester=${requesterEmail} sent=${sent} failed=${failed}`)
}

type BallotResetVoter = { name: string; email: string; token: string }
type BallotResetElection = { title: string; emailLogoUrl: string | null; emailFooter: string | null }

function buildBallotResetHtml(voter: BallotResetVoter, election: BallotResetElection): string {
  const name = escapeHtml(voter.name)
  const title = escapeHtml(election.title)
  const link = escapeHtml(absolutizeUrl(`/vote/${voter.token}`))
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

function buildBallotResetAdminHtml(electionTitle: string, organizerEmail: string, voterCount: number): string {
  const title = escapeHtml(electionTitle)
  const organizer = escapeHtml(organizerEmail)
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
    </td></tr>
    <tr><td style="padding:0 32px 14px;">
      <a href="${resultsUrl}" style="display:inline-block;background:${C.accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;">View Elections →</a>
    </td></tr>
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td style="border-top:1px solid ${C.line};padding-top:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:${C.muted};line-height:1.6;">
          You received this because you are an administrator on VoteHost.
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

export async function sendBallotResetAdminNotice(electionTitle: string, organizerEmail: string, voterCount: number): Promise<void> {
  const config = await getAllEmailConfig()
  const admins = await db.adminUser.findMany({ where: { role: "ADMIN" }, select: { email: true } })
  if (admins.length === 0) return
  const subject = `Ballot reset — ${electionTitle}`
  const html = buildBallotResetAdminHtml(electionTitle, organizerEmail, voterCount)
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
          You received this because you administer or organize elections on VoteHost.
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
          You received this because you administer or organize elections on VoteHost.
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
          You received this because you administer or organize elections on VoteHost.
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
