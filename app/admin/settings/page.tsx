"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function StorageSettings() {
  const [days, setDays] = useState("30")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    fetch("/api/settings/general")
      .then((r) => r.json())
      .then((d) => { setDays(d.image_retention_days ?? "30"); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setStatus("idle")
    setErrorMsg("")
    try {
      const res = await fetch("/api/settings/general", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_retention_days: days }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus("saved")
      } else {
        setStatus("error")
        setErrorMsg(data.error ?? "Failed to save")
      }
    } catch {
      setStatus("error")
      setErrorMsg("Failed to save")
    } finally {
      setSaving(false)
      setTimeout(() => setStatus("idle"), 3000)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Storage &amp; Retention</h2>
      <p className="text-zinc-500 text-sm mb-4">
        Uploaded images (logos and candidate photos) are stored on this server. After an election
        closes, the cron job can replace image files with a transparent placeholder to reduce
        bandwidth from old emails — the image URLs remain valid so no broken-image icons appear in
        voter inboxes.
      </p>
      {loading ? (
        <p className="text-zinc-400 text-sm">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="image_retention_days">Image retention (days after election closes)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="image_retention_days"
                type="number"
                min={1}
                placeholder="30"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-28"
              />
              <span className="text-sm text-zinc-400">Leave blank to never auto-purge</span>
            </div>
            <p className="text-xs text-zinc-400">
              Default: 30 days. Set to blank to disable automatic cleanup.
              Images can always be purged immediately from the election Settings page.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {status === "saved" && <span className="text-sm text-green-600">Saved.</span>}
            {status === "error" && <span className="text-sm text-red-600">{errorMsg}</span>}
          </div>
        </form>
      )}
    </div>
  )
}

type EmailPreset = "resend" | "gmail" | "icloud" | "outlook" | "yahoo" | "smtp"

type EmailSettings = {
  email_provider: "resend" | "smtp"
  email_preset: EmailPreset
  resend_api_key: string
  email_from_address: string
  email_from_name: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_secure: string
}

const DEFAULT_SETTINGS: EmailSettings = {
  email_provider: "resend",
  email_preset: "resend",
  resend_api_key: "",
  email_from_address: "",
  email_from_name: "VoteHost",
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_secure: "false",
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type PresetConfig = {
  label: string
  provider: "resend" | "smtp"
  smtp?: { host: string; port: string; secure: "true" | "false" }
  tips: { title: string; body: React.ReactNode }
}

const PRESETS: Record<EmailPreset, PresetConfig> = {
  resend: {
    label: "Resend",
    provider: "resend",
    tips: {
      title: "About Resend",
      body: (
        <>
          API-based delivery with high deliverability. Generate an API key at{" "}
          <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline">
            resend.com/api-keys
          </a>
          . The From Address must be on a domain you&apos;ve verified in Resend.
        </>
      ),
    },
  },
  gmail: {
    label: "Gmail",
    provider: "smtp",
    smtp: { host: "smtp.gmail.com", port: "587", secure: "false" },
    tips: {
      title: "Setting up Gmail",
      body: (
        <>
          Gmail SMTP requires a 16-character <strong>App Password</strong> — not your regular Gmail password. Generate
          one at{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
            myaccount.google.com/apppasswords
          </a>{" "}
          (2-Step Verification must be enabled). Daily send limit: ~500 emails for free accounts.
        </>
      ),
    },
  },
  icloud: {
    label: "iCloud Mail",
    provider: "smtp",
    smtp: { host: "smtp.mail.me.com", port: "587", secure: "false" },
    tips: {
      title: "Setting up iCloud Mail",
      body: (
        <>
          iCloud requires an <strong>app-specific password</strong>. Generate one at{" "}
          <a href="https://account.apple.com/account/manage" target="_blank" rel="noreferrer" className="underline">
            account.apple.com
          </a>{" "}
          under Sign-In and Security → App-Specific Passwords (requires 2FA). Use your full @icloud.com address as
          the username. Daily send limit: ~1,000 emails — a good fit for larger elections.
        </>
      ),
    },
  },
  outlook: {
    label: "Microsoft 365 / Outlook",
    provider: "smtp",
    smtp: { host: "smtp.office365.com", port: "587", secure: "false" },
    tips: {
      title: "Setting up Microsoft 365 / Outlook",
      body: (
        <>
          Use your full email address as the username and your regular password. If your tenant blocks basic SMTP
          auth (common on enterprise plans), ask an admin to enable <em>Authenticated SMTP</em> for the mailbox, or
          generate an{" "}
          <a
            href="https://support.microsoft.com/en-us/account-billing/manage-app-passwords-for-two-step-verification-d6dc8c6d-4bf7-4851-ad95-6d07799387e9"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            App Password
          </a>{" "}
          if MFA is enabled.
        </>
      ),
    },
  },
  yahoo: {
    label: "Yahoo Mail",
    provider: "smtp",
    smtp: { host: "smtp.mail.yahoo.com", port: "465", secure: "true" },
    tips: {
      title: "Setting up Yahoo Mail",
      body: (
        <>
          Yahoo requires an <strong>App Password</strong>. Generate one at{" "}
          <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer" className="underline">
            Yahoo Account Security
          </a>{" "}
          → Generate app password (2-step verification must be enabled). Use your full @yahoo.com address as the
          username.
        </>
      ),
    },
  },
  smtp: {
    label: "General SMTP",
    provider: "smtp",
    smtp: { host: "", port: "587", secure: "false" },
    tips: {
      title: "Custom SMTP server",
      body: (
        <>
          Enter your provider&apos;s SMTP host, port, and TLS mode below. Use STARTTLS on port 587 or Implicit TLS
          on port 465 unless your provider specifies otherwise.
        </>
      ),
    },
  },
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [testEmail, setTestEmail] = useState("")
  const [testing, setTesting] = useState(false)
  const [testStatus, setTestStatus] = useState<"idle" | "sent" | "error">("idle")
  const [testError, setTestError] = useState("")

  useEffect(() => {
    fetch("/api/settings/email")
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setSettings(data)
        setLoading(false)
      })
      .catch((err) => {
        setLoadError(String(err))
        setLoading(false)
      })
  }, [])

  function set<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  function applyPreset(next: EmailPreset) {
    const cfg = PRESETS[next]
    setSettings((s) => ({
      ...s,
      email_preset: next,
      email_provider: cfg.provider,
      ...(cfg.smtp ? {
        smtp_host: cfg.smtp.host,
        smtp_port: cfg.smtp.port,
        smtp_secure: cfg.smtp.secure,
      } : {}),
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      setSaveStatus(res.ok ? "saved" : "error")
    } catch {
      setSaveStatus("error")
    } finally {
      setSaving(false)
      setTimeout(() => setSaveStatus("idle"), 3000)
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault()
    if (!testEmail) return
    setTesting(true)
    setTestStatus("idle")
    setTestError("")
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestStatus("sent")
      } else {
        setTestStatus("error")
        setTestError(data.error ?? "Unknown error")
      }
    } catch (err) {
      setTestStatus("error")
      setTestError(String(err))
    } finally {
      setTesting(false)
      setTimeout(() => setTestStatus("idle"), 5000)
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8">
        <p className="text-zinc-500 text-sm">Loading settings…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-8">
        <h1 className="text-2xl font-bold mb-2">Email Settings</h1>
        <p className="text-red-600 text-sm">Failed to load settings: {loadError}</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Email Settings</h1>
      <p className="text-zinc-500 text-sm mb-8">
        Configure the email provider used to send voting invitations.
      </p>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Provider preset selector */}
        <div className="space-y-1.5">
          <Label htmlFor="email_preset">Email Provider</Label>
          <select
            id="email_preset"
            value={settings.email_preset}
            onChange={(e) => applyPreset(e.target.value as EmailPreset)}
            className={selectClass}
          >
            {(Object.keys(PRESETS) as EmailPreset[]).map((k) => (
              <option key={k} value={k}>{PRESETS[k].label}</option>
            ))}
          </select>
        </div>

        {/* Provider-specific tips */}
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <div className="font-medium mb-1">{PRESETS[settings.email_preset].tips.title}</div>
          <p className="text-zinc-600 leading-relaxed">{PRESETS[settings.email_preset].tips.body}</p>
        </div>

        {/* Shared fields */}
        <div className="space-y-1.5">
          <Label htmlFor="email_from_name">From Name</Label>
          <Input
            id="email_from_name"
            placeholder="VoteHost"
            value={settings.email_from_name}
            onChange={(e) => set("email_from_name", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email_from_address">From Address</Label>
          <Input
            id="email_from_address"
            type="email"
            placeholder="votes@yourdomain.com"
            value={settings.email_from_address}
            onChange={(e) => set("email_from_address", e.target.value)}
          />
          {settings.email_preset === "resend" ? (
            <p className="text-xs text-zinc-400">
              Must be a verified sender in your Resend account.
            </p>
          ) : (
            <p className="text-xs text-zinc-400">
              Most providers require this to match your SMTP username.
            </p>
          )}
        </div>

        {/* Resend-only */}
        {settings.email_preset === "resend" && (
          <div className="space-y-1.5">
            <Label htmlFor="resend_api_key">Resend API Key</Label>
            <Input
              id="resend_api_key"
              type="password"
              placeholder="re_••••••••••••••••••••••"
              value={settings.resend_api_key}
              onChange={(e) => set("resend_api_key", e.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        {/* SMTP-only */}
        {settings.email_preset !== "resend" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                placeholder="smtp.example.com"
                value={settings.smtp_host}
                onChange={(e) => set("smtp_host", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp_port">Port</Label>
                <Input
                  id="smtp_port"
                  placeholder="587"
                  value={settings.smtp_port}
                  onChange={(e) => set("smtp_port", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp_secure">TLS Mode</Label>
                <select
                  id="smtp_secure"
                  value={settings.smtp_secure}
                  onChange={(e) => set("smtp_secure", e.target.value)}
                  className={selectClass}
                >
                  <option value="false">STARTTLS (port 587)</option>
                  <option value="true">Implicit TLS (port 465)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_user">Username</Label>
              <Input
                id="smtp_user"
                placeholder="you@example.com"
                value={settings.smtp_user}
                onChange={(e) => set("smtp_user", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_pass">Password / App Password</Label>
              <Input
                id="smtp_pass"
                type="password"
                value={settings.smtp_pass}
                onChange={(e) => set("smtp_pass", e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saveStatus === "saved" && <span className="text-sm text-green-600">Settings saved.</span>}
          {saveStatus === "error" && <span className="text-sm text-red-600">Failed to save.</span>}
        </div>
      </form>

      <hr className="my-8 border-zinc-200" />

      <h2 className="text-lg font-semibold mb-1">Send a test email</h2>
      <p className="text-zinc-500 text-sm mb-4">
        Verify your configuration by sending a sample invitation.
      </p>

      <form onSubmit={handleTest} className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="test_email">Recipient</Label>
          <Input
            id="test_email"
            type="email"
            placeholder="you@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={testing || !testEmail} className="w-full sm:w-auto">
          {testing ? "Sending…" : "Send test"}
        </Button>
      </form>

      {testStatus === "sent" && (
        <p className="text-sm text-green-600 mt-3">Test email sent successfully.</p>
      )}
      {testStatus === "error" && (
        <p className="text-sm text-red-600 mt-3">Failed: {testError}</p>
      )}

      <hr className="my-8 border-zinc-200" />
      <StorageSettings />
    </div>
  )
}
