"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BRAND_NAME, RELEASES_URL } from "@/lib/branding"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import BackupRestorePanel from "@/components/admin/BackupRestorePanel"

function SecuritySettings() {
  const [notifyAdmins, setNotifyAdmins] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")

  useEffect(() => {
    fetch("/api/settings/security")
      .then((r) => r.json())
      .then((d) => { setNotifyAdmins(d.notifyAdminsOnReset ?? false); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleToggle(checked: boolean) {
    setSaving(true)
    setStatus("idle")
    try {
      const res = await fetch("/api/settings/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyAdminsOnReset: checked }),
      })
      if (res.ok) {
        setNotifyAdmins(checked)
        setStatus("saved")
        setTimeout(() => setStatus("idle"), 3000)
      } else {
        setStatus("error")
      }
    } catch {
      setStatus("error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Security</h2>
      <p className="text-zinc-500 text-sm mb-4">
        When enabled, all administrators will receive an email whenever a password reset is requested
        or completed by any user. Useful as an audit signal for security-conscious installations. Off by default.
      </p>
      {loading ? (
        <p className="text-zinc-400 text-sm">Loading…</p>
      ) : (
        <div className="flex items-start gap-3">
          <button
            role="switch"
            aria-checked={notifyAdmins}
            disabled={saving}
            onClick={() => handleToggle(!notifyAdmins)}
            className="mt-0.5 relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-60"
            style={{ background: notifyAdmins ? "var(--vh-accent)" : "var(--vh-surface-3)" }}
          >
            <span
              className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              style={{ transform: notifyAdmins ? "translateX(16px)" : "translateX(0)" }}
            />
          </button>
          <div>
            <p className="text-sm font-medium text-zinc-700">Email administrators about password reset activity</p>
            {status === "saved" && <p className="text-xs text-green-600 mt-0.5">Saved.</p>}
            {status === "error" && <p className="text-xs text-red-600 mt-0.5">Failed to save.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/St_Johns",
  "America/Halifax",
  "America/Toronto",
  "America/Winnipeg",
  "America/Edmonton",
  "America/Vancouver",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Athens",
  "Europe/Moscow",
  "Asia/Dubai",
  "Africa/Johannesburg",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
]

function GeneralSettings() {
  const router = useRouter()
  const [days, setDays] = useState("30")
  const [tz, setTz] = useState("UTC")
  const [otherTz, setOtherTz] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const isOther = !COMMON_TIMEZONES.includes(tz)

  useEffect(() => {
    fetch("/api/settings/general")
      .then((r) => r.json())
      .then((d) => {
        setDays(d.image_retention_days ?? "30")
        const loaded = d.display_time_zone ?? "UTC"
        if (COMMON_TIMEZONES.includes(loaded)) {
          setTz(loaded)
        } else {
          setTz("__other__")
          setOtherTz(loaded)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function handleTzChange(val: string) {
    setTz(val)
    if (val !== "__other__") setOtherTz("")
  }

  const effectiveTz = tz === "__other__" ? otherTz.trim() : tz

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!effectiveTz) return
    setSaving(true)
    setStatus("idle")
    setErrorMsg("")
    try {
      const res = await fetch("/api/settings/general", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_retention_days: days, display_time_zone: effectiveTz }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus("saved")
        if (tz === "__other__" && otherTz.trim()) {
          setTz(otherTz.trim())
          setOtherTz("")
        }
        router.refresh()
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
      <h2 className="text-lg font-semibold mb-1">General</h2>
      <p className="text-zinc-500 text-sm mb-4">
        Configure display settings for this installation.
      </p>
      {loading ? (
        <p className="text-zinc-400 text-sm">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="display_time_zone">Display timezone</Label>
            <select
              id="display_time_zone"
              value={isOther ? "__other__" : tz}
              onChange={(e) => handleTzChange(e.target.value)}
              className={selectClass}
            >
              {COMMON_TIMEZONES.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
              <option value="__other__">Other (IANA name)…</option>
            </select>
            {(tz === "__other__" || isOther) && (
              <Input
                placeholder="e.g. America/Toronto"
                value={otherTz}
                onChange={(e) => setOtherTz(e.target.value)}
                className="bg-white mt-1.5"
                autoComplete="off"
              />
            )}
            <p className="text-xs text-zinc-400">
              Controls how dates appear in emails, exports, and the admin interface.
              The container always stores timestamps in UTC; this is a display-only setting.
            </p>
          </div>

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
                className="w-28 bg-white"
              />
              <span className="text-sm text-zinc-400">Leave blank to never auto-purge</span>
            </div>
            <p className="text-xs text-zinc-400">
              Default: 30 days. Set to blank to disable automatic cleanup.
              Images can always be purged immediately from the election Settings page.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving || (tz === "__other__" && !otherTz.trim())}>
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

type EmailPreset = "smtp" | "resend" | "gmail" | "icloud" | "outlook" | "yahoo"

type EmailSettings = {
  email_provider: "resend" | "smtp"
  email_preset: EmailPreset
  resend_api_key: string
  resend_webhook_secret: string
  email_from_address: string
  email_from_name: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_secure: string
}

const DEFAULT_SETTINGS: EmailSettings = {
  email_provider: "smtp",
  email_preset: "smtp",
  resend_api_key: "",
  resend_webhook_secret: "",
  email_from_address: "",
  email_from_name: BRAND_NAME,
  smtp_host: "",
  smtp_port: "587",
  smtp_user: "",
  smtp_pass: "",
  smtp_secure: "false",
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

type PresetConfig = {
  label: string
  provider: "resend" | "smtp"
  smtp?: { host: string; port: string; secure: "true" | "false" }
  tips: { title: string; body: React.ReactNode }
}

const PRESETS: Record<EmailPreset, PresetConfig> = {
  smtp: {
    label: "General SMTP",
    provider: "smtp",
    smtp: { host: "", port: "587", secure: "false" },
    tips: {
      title: "Custom SMTP server",
      body: (
        <>
          Enter your provider&apos;s SMTP host, port, and TLS mode below. Use STARTTLS on port 587 or Implicit TLS
          on port 465 unless your provider specifies otherwise. Daily send limit: varies by provider — check your
          service&apos;s documentation.
        </>
      ),
    },
  },
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
          . The From Address must be on a domain you&apos;ve verified in Resend. Daily send limit: ~100 emails on
          the free tier (3,000/month); paid plans send substantially more.
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
          if MFA is enabled. Daily send limit: ~300 emails for free outlook.com accounts; ~10,000 for Microsoft 365
          business mailboxes.
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
          username. Daily send limit: ~500 emails on free accounts.
        </>
      ),
    },
  },
}

export default function SettingsPage({ hasActiveElections }: { hasActiveElections: boolean }) {
  const [settings, setSettings] = useState<EmailSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [saveError, setSaveError] = useState("")
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
    setSaveError("")
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setSaveStatus("saved")
      } else {
        const data = await res.json().catch(() => ({}))
        setSaveStatus("error")
        setSaveError(data.error ?? `Server error ${res.status}`)
      }
    } catch (err) {
      setSaveStatus("error")
      setSaveError(String(err))
    } finally {
      setSaving(false)
      setTimeout(() => setSaveStatus("idle"), 5000)
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
        <h1 className="text-2xl font-bold mb-2">System Settings</h1>
        <p className="text-red-600 text-sm">Failed to load settings: {loadError}</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-1">System Settings</h1>
      <p className="text-zinc-500 text-sm mb-8">
        Configure email delivery, security, storage, and backups for this {BRAND_NAME} install.
      </p>

      <h2 className="text-lg font-semibold mb-1">Email Settings</h2>
      <p className="text-zinc-500 text-sm mb-4">
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
            placeholder={BRAND_NAME}
            value={settings.email_from_name}
            onChange={(e) => set("email_from_name", e.target.value)}
            autoComplete="off"
            className="bg-white"
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
            autoComplete="email"
            className="bg-white"
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
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resend_api_key">Resend API Key</Label>
              <Input
                id="resend_api_key"
                type="password"
                placeholder="re_••••••••••••••••••••••"
                value={settings.resend_api_key}
                onChange={(e) => set("resend_api_key", e.target.value)}
                autoComplete="off"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="resend_webhook_secret">Webhook Signing Secret <span className="text-xs font-normal text-zinc-400">(optional)</span></Label>
              <Input
                id="resend_webhook_secret"
                type="password"
                placeholder="whsec_••••••••••••••••••••••"
                value={settings.resend_webhook_secret}
                onChange={(e) => set("resend_webhook_secret", e.target.value)}
                autoComplete="off"
                className="bg-white"
              />
              <p className="text-xs text-zinc-400">
                Enables real-time bounce tracking via Resend webhooks. In your Resend dashboard, add a webhook pointing to{" "}
                <code className="text-zinc-600">/api/email/webhook</code>{" "}
                and paste the signing secret here. Leave blank to disable.
              </p>
            </div>
          </div>
        )}

        {/* SMTP-only */}
        {settings.email_preset !== "resend" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                type="text"
                placeholder="smtp.example.com"
                value={settings.smtp_host}
                onChange={(e) => set("smtp_host", e.target.value)}
                className="bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="smtp_port">Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  placeholder="587"
                  value={settings.smtp_port}
                  onChange={(e) => set("smtp_port", e.target.value)}
                  className="bg-white"
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="bg-white"
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
                className="bg-white"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {saveStatus === "saved" && <span className="text-sm text-green-600">Settings saved.</span>}
          {saveStatus === "error" && <span className="text-sm text-red-600">Failed to save: {saveError}</span>}
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
            className="bg-white"
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
      <SecuritySettings />

      <hr className="my-8 border-zinc-200" />
      <GeneralSettings />

      <hr className="my-8 border-zinc-200" />
      <BackupRestorePanel hasActiveElections={hasActiveElections} />

      <p className="text-center text-xs text-zinc-400 mt-12">
        {BRAND_NAME} v{process.env.NEXT_PUBLIC_APP_VERSION}
        {process.env.NEXT_PUBLIC_GIT_SHA !== "dev" && (
          <span className="ml-1">({process.env.NEXT_PUBLIC_GIT_SHA})</span>
        )}
        {" — "}
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-zinc-600"
        >
          What&apos;s new ↗
        </a>
      </p>
    </div>
  )
}
