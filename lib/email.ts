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

type Payload = {
  voterName: string
  voterEmail: string
  electionTitle: string
  magicLink: string
}

function buildHtml(payload: Payload) {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 24px; margin-bottom: 8px;">You're invited to vote</h1>
      <p style="color: #555; margin-bottom: 24px;">Hi ${payload.voterName},</p>
      <p style="margin-bottom: 24px;">
        You've been invited to participate in the election: <strong>${payload.electionTitle}</strong>
      </p>
      <a href="${payload.magicLink}"
         style="display: inline-block; background: #111; color: #fff; padding: 12px 24px;
                border-radius: 6px; text-decoration: none; font-weight: 600;">
        Vote Now
      </a>
      <p style="color: #888; font-size: 12px; margin-top: 32px;">
        This link is unique to you. Do not share it with others. It can only be used once.
      </p>
    </div>
  `
}

async function sendViaResend(config: ResendConfig, payload: Payload): Promise<{ error: string | null }> {
  try {
    const resend = new Resend(config.apiKey)
    const { error } = await resend.emails.send({
      from: `${config.fromName} <${config.fromAddress}>`,
      to: payload.voterEmail,
      subject: `You're invited to vote: ${payload.electionTitle}`,
      html: buildHtml(payload),
    })
    return { error: error ? String(error) : null }
  } catch (err) {
    return { error: String(err) }
  }
}

async function sendViaSmtp(config: SmtpConfig, payload: Payload): Promise<{ error: string | null }> {
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
      subject: `You're invited to vote: ${payload.electionTitle}`,
      html: buildHtml(payload),
    })
    return { error: null }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function sendBallotInvitation(payload: Payload): Promise<{ error: string | null }> {
  const config = await getAllEmailConfig()
  if (config.provider === "smtp") return sendViaSmtp(config, payload)
  return sendViaResend(config, payload)
}
