import { Resend } from "resend"
import nodemailer from "nodemailer"
import { db } from "@/lib/db"

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

export type EmailMode = "invite" | "reminder-early" | "reminder-final"

type Payload = {
  voterName: string
  voterEmail: string
  electionTitle: string
  magicLink: string
  emailSubject?: string | null
  emailMessage?: string | null
  emailLogoUrl?: string | null
  emailFooter?: string | null
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
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
  // reminder-final
  return customSubject
    ? `Closing in 24 hours: ${customSubject}`
    : `Closing in 24 hours: ${electionTitle}`
}

type ModeConfig = {
  heading: string
  intro: string
  buttonText: string
  buttonColor: string
}

function getModeConfig(mode: EmailMode, electionTitle: string): ModeConfig {
  const title = escapeHtml(electionTitle)
  if (mode === "reminder-early") {
    return {
      heading: "Reminder: you haven't voted yet",
      intro: `We noticed you haven't cast your ballot for <strong>${title}</strong> yet. Don't miss your chance to have your say.`,
      buttonText: "Vote Now",
      buttonColor: "#111",
    }
  }
  if (mode === "reminder-final") {
    return {
      heading: "Voting closes in 24 hours",
      intro: `<strong>${title}</strong> is closing soon. This is your last chance to vote.`,
      buttonText: "Vote before it closes",
      buttonColor: "#dc2626",
    }
  }
  return {
    heading: "You're invited to vote",
    intro: `You've been invited to participate in the election: <strong>${title}</strong>`,
    buttonText: "Vote Now",
    buttonColor: "#111",
  }
}

function buildHtml(payload: Payload, mode: EmailMode) {
  const cfg = getModeConfig(mode, payload.electionTitle)
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      ${payload.emailLogoUrl ? `<img src="${escapeHtml(payload.emailLogoUrl)}" alt="" style="max-width: 100%; margin-bottom: 24px; display: block;" />` : ""}
      <h1 style="font-size: 24px; margin-bottom: 8px;">${cfg.heading}</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi ${escapeHtml(payload.voterName)},</p>
      <p style="margin-bottom: 24px;">${cfg.intro}</p>
      ${payload.emailMessage ? `<p style="margin-bottom: 24px;">${escapeHtml(payload.emailMessage)}</p>` : ""}
      <a href="${escapeHtml(payload.magicLink)}"
         style="display: inline-block; background: ${cfg.buttonColor}; color: #fff; padding: 12px 24px;
                border-radius: 6px; text-decoration: none; font-weight: 600;">
        ${cfg.buttonText}
      </a>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        This link is unique to you. Do not share it with others. It can only be used once.
      </p>
      ${payload.emailFooter ? `<p style="color: #888; font-size: 12px; margin-top: 8px;">${escapeHtml(payload.emailFooter)}</p>` : ""}
    </div>
  `
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
