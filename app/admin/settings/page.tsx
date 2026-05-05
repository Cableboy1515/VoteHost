"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type EmailSettings = {
  email_provider: "resend" | "smtp"
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

  function applyGmailPreset() {
    setSettings((s) => ({ ...s, smtp_host: "smtp.gmail.com", smtp_port: "587", smtp_secure: "false" }))
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
      <div className="p-8">
        <p className="text-zinc-500 text-sm">Loading settings…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Email Settings</h1>
        <p className="text-red-600 text-sm">Failed to load settings: {loadError}</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Email Settings</h1>
      <p className="text-zinc-500 text-sm mb-8">
        Configure the email provider used to send voting invitations.
      </p>

      <form onSubmit={handleSave} className="space-y-5">

        {/* Provider selector */}
        <div className="space-y-1.5">
          <Label htmlFor="email_provider">Email Provider</Label>
          <select
            id="email_provider"
            value={settings.email_provider}
            onChange={(e) => set("email_provider", e.target.value as "resend" | "smtp")}
            className={selectClass}
          >
            <option value="resend">Resend</option>
            <option value="smtp">SMTP / Gmail</option>
          </select>
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
          {settings.email_provider === "resend" && (
            <p className="text-xs text-zinc-400">
              Must be a verified sender in your Resend account.
            </p>
          )}
        </div>

        {/* Resend-only */}
        {settings.email_provider === "resend" && (
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
            <p className="text-xs text-zinc-400">
              Get your API key from{" "}
              <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline">
                resend.com/api-keys
              </a>
              .
            </p>
          </div>
        )}

        {/* SMTP-only */}
        {settings.email_provider === "smtp" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="sm" onClick={applyGmailPreset}>
                Use Gmail preset
              </Button>
              <p className="text-xs text-zinc-400">
                Fills host, port, and TLS for Gmail.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input
                id="smtp_host"
                placeholder="smtp.gmail.com"
                value={settings.smtp_host}
                onChange={(e) => set("smtp_host", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
                placeholder="you@gmail.com"
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
              <p className="text-xs text-zinc-400">
                For Gmail, generate a 16-character App Password in your Google Account security
                settings. Do not use your regular Gmail password.
              </p>
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

      <form onSubmit={handleTest} className="flex items-end gap-3">
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
        <Button type="submit" variant="outline" disabled={testing || !testEmail}>
          {testing ? "Sending…" : "Send test"}
        </Button>
      </form>

      {testStatus === "sent" && (
        <p className="text-sm text-green-600 mt-3">Test email sent successfully.</p>
      )}
      {testStatus === "error" && (
        <p className="text-sm text-red-600 mt-3">Failed: {testError}</p>
      )}
    </div>
  )
}
