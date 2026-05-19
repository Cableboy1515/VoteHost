export type EmailPreset = "resend" | "gmail" | "icloud" | "outlook" | "yahoo" | "smtp"

export type PresetData = {
  label: string
  provider: "resend" | "smtp"
  smtp?: { host: string; port: string; secure: "true" | "false" }
  tipTitle: string
  tipText: string
  tipUrl?: { label: string; href: string }
}

export const PRESETS: Record<EmailPreset, PresetData> = {
  resend: {
    label: "Resend",
    provider: "resend",
    tipTitle: "About Resend",
    tipText:
      "API-based delivery with high deliverability. The From Address must be on a domain you've verified in Resend.",
    tipUrl: { label: "resend.com/api-keys", href: "https://resend.com/api-keys" },
  },
  gmail: {
    label: "Gmail",
    provider: "smtp",
    smtp: { host: "smtp.gmail.com", port: "587", secure: "false" },
    tipTitle: "Setting up Gmail",
    tipText:
      "Gmail SMTP requires a 16-character App Password — not your regular password. 2-Step Verification must be enabled. Daily send limit: ~500 emails.",
    tipUrl: { label: "Generate App Password", href: "https://myaccount.google.com/apppasswords" },
  },
  icloud: {
    label: "iCloud Mail",
    provider: "smtp",
    smtp: { host: "smtp.mail.me.com", port: "587", secure: "false" },
    tipTitle: "Setting up iCloud Mail",
    tipText:
      "iCloud requires an app-specific password. Use your full @icloud.com address as the username. Daily send limit: ~1,000 emails.",
    tipUrl: { label: "account.apple.com", href: "https://account.apple.com/account/manage" },
  },
  outlook: {
    label: "Microsoft 365 / Outlook",
    provider: "smtp",
    smtp: { host: "smtp.office365.com", port: "587", secure: "false" },
    tipTitle: "Setting up Microsoft 365 / Outlook",
    tipText:
      "Use your full email address as the username. If basic SMTP auth is blocked, ask an admin to enable Authenticated SMTP, or generate an App Password if MFA is enabled.",
  },
  yahoo: {
    label: "Yahoo Mail",
    provider: "smtp",
    smtp: { host: "smtp.mail.yahoo.com", port: "465", secure: "true" },
    tipTitle: "Setting up Yahoo Mail",
    tipText:
      "Yahoo requires an App Password (2-step verification must be enabled). Use your full @yahoo.com address as the username.",
    tipUrl: { label: "Yahoo Account Security", href: "https://login.yahoo.com/account/security" },
  },
  smtp: {
    label: "General SMTP",
    provider: "smtp",
    smtp: { host: "", port: "587", secure: "false" },
    tipTitle: "Custom SMTP server",
    tipText:
      "Enter your provider's SMTP host, port, and TLS mode. Use STARTTLS on port 587 or Implicit TLS on port 465 unless your provider specifies otherwise.",
  },
}

export const PRESET_KEYS = Object.keys(PRESETS) as EmailPreset[]
