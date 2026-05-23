"use client"

import { useState, useEffect } from "react"
import { BRAND_NAME } from "@/lib/branding"
import { PRESETS, PRESET_KEYS, type EmailPreset } from "@/lib/emailProviderPresets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-white px-2.5 text-sm outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu",
  "America/St_Johns", "America/Halifax", "America/Toronto",
  "America/Winnipeg", "America/Edmonton", "America/Vancouver",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Paris",
  "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam",
  "Europe/Stockholm", "Europe/Helsinki", "Europe/Athens", "Europe/Moscow",
  "Asia/Dubai", "Africa/Johannesburg", "Asia/Kolkata", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo",
  "Australia/Perth", "Australia/Adelaide", "Australia/Sydney", "Pacific/Auckland",
]

type WizardStep = "welcome" | "timezone" | "credentials" | "identity" | "test" | "done"

type FormState = {
  preset: EmailPreset | ""
  resend_api_key: string
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_secure: string
  email_from_name: string
  email_from_address: string
}

const STEP_ORDER: WizardStep[] = ["welcome", "timezone", "credentials", "identity", "test", "done"]
const STEP_LABELS: Record<WizardStep, string> = {
  welcome: "Welcome",
  timezone: "Timezone",
  credentials: "Provider",
  identity: "Identity",
  test: "Test",
  done: "Done",
}

function StepIndicator({ current }: { current: WizardStep }) {
  const steps: WizardStep[] = ["credentials", "identity", "test"]
  if (current === "welcome" || current === "timezone" || current === "done") return null
  const currentIdx = steps.indexOf(current)

  return (
    <div className="flex items-center gap-2 mb-5">
      {steps.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <div key={s} className="flex items-center gap-2">
            <div
              className="flex items-center gap-1.5"
            >
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
                style={{
                  background: active || done ? "var(--vh-accent)" : "var(--vh-surface-2)",
                  color: active || done ? "#fff" : "var(--vh-muted)",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className="text-[12.5px]"
                style={{ color: active ? "var(--vh-ink)" : "var(--vh-muted)", fontWeight: active ? 500 : 400 }}
              >
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-6 h-px flex-shrink-0" style={{ background: "var(--vh-line)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function EmailSetupWizard({
  open,
  onClose,
  adminEmail,
}: {
  open: boolean
  onClose: (configured: boolean) => void
  adminEmail: string
}) {
  const [step, setStep] = useState<WizardStep>("welcome")
  const [form, setForm] = useState<FormState>({
    preset: "",
    resend_api_key: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    smtp_secure: "false",
    email_from_name: BRAND_NAME,
    email_from_address: adminEmail,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [testTo, setTestTo] = useState(adminEmail)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<"idle" | "sent" | "error">("idle")
  const [testError, setTestError] = useState("")
  const [skipping, setSkipping] = useState(false)

  const [tz, setTz] = useState("UTC")
  const [otherTz, setOtherTz] = useState("")
  const [savingTz, setSavingTz] = useState(false)
  const [tzError, setTzError] = useState("")

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (!detected) return
      if (COMMON_TIMEZONES.includes(detected)) {
        setTz(detected)
      } else {
        setTz("__other__")
        setOtherTz(detected)
      }
    } catch {}
  }, [])

  const effectiveTz = tz === "__other__" ? otherTz.trim() : tz

  function tzPreview(timezone: string): string {
    if (!timezone) return ""
    try {
      return new Date().toLocaleString("en-US", {
        timeZone: timezone,
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    } catch {
      return ""
    }
  }

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function applyPreset(next: EmailPreset | "") {
    if (!next) {
      setForm((f) => ({ ...f, preset: "" }))
      return
    }
    const cfg = PRESETS[next]
    setForm((f) => ({
      ...f,
      preset: next,
      ...(cfg.smtp
        ? { smtp_host: cfg.smtp.host, smtp_port: cfg.smtp.port, smtp_secure: cfg.smtp.secure }
        : {}),
    }))
  }

  async function markSeen() {
    try {
      await fetch("/api/onboarding/email-wizard-seen", { method: "POST" })
    } catch {}
  }

  async function handleSkip() {
    setSkipping(true)
    await markSeen()
    setSkipping(false)
    resetWizard()
    onClose(false)
  }

  function resetWizard() {
    setStep("welcome")
    setSaving(false)
    setSaveError("")
    setTestResult("idle")
    setTestError("")
    setSavingTz(false)
    setTzError("")
  }

  async function handleSaveTimezone() {
    if (!effectiveTz) return
    setSavingTz(true)
    setTzError("")
    try {
      const res = await fetch("/api/settings/general", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_time_zone: effectiveTz }),
      })
      if (res.ok) {
        setStep("credentials")
      } else {
        const d = await res.json().catch(() => ({}))
        setTzError(d.error ?? `Server error ${res.status}`)
      }
    } catch (err) {
      setTzError(String(err))
    } finally {
      setSavingTz(false)
    }
  }

  async function handleSaveAndContinue() {
    if (!form.preset) return
    setSaving(true)
    setSaveError("")
    const preset = PRESETS[form.preset]
    const body: Record<string, string> = {
      email_provider: preset.provider,
      email_preset: form.preset,
      email_from_name: form.email_from_name,
      email_from_address: form.email_from_address,
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_user: form.smtp_user,
      smtp_pass: form.smtp_pass,
      smtp_secure: form.smtp_secure,
    }
    if (form.preset === "resend") {
      body.resend_api_key = form.resend_api_key
    }
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setStep("test")
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error ?? `Server error ${res.status}`)
      }
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleSendTest() {
    if (!testTo) return
    setTesting(true)
    setTestResult("idle")
    setTestError("")
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      })
      const d = await res.json()
      if (res.ok) {
        setTestResult("sent")
      } else {
        setTestResult("error")
        setTestError(d.error ?? "Unknown error")
      }
    } catch (err) {
      setTestResult("error")
      setTestError(String(err))
    } finally {
      setTesting(false)
    }
  }

  async function handleFinish() {
    await markSeen()
    resetWizard()
    onClose(true)
  }

  const preset = form.preset ? PRESETS[form.preset] : null

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && step !== "done") handleSkip()
        if (!isOpen && step === "done") handleFinish()
      }}
    >
      <DialogContent showCloseButton={step !== "done"} className="sm:max-w-lg p-6">
        <DialogHeader>
          <DialogTitle className="text-[17px]">
            {step === "welcome" && "Set up outbound email"}
            {step === "timezone" && "Your timezone"}
            {step === "credentials" && "Choose your email provider"}
            {step === "identity" && "Sender identity"}
            {step === "test" && "Send a test email"}
            {step === "done" && "Email is ready"}
          </DialogTitle>
        </DialogHeader>

        <StepIndicator current={step} />

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--vh-ink-soft)" }}>
              {BRAND_NAME} sends email to deliver ballot invitations, voting reminders, and
              password setup links. Without an email provider, voters can't receive their
              ballot links.
            </p>
            <div
              className="rounded-[12px] p-4 space-y-1.5 text-[13px]"
              style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
            >
              {["Ballot invitations when an election opens", "Reminder emails before voting closes", "Password setup links for new users"].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <span style={{ color: "var(--vh-accent)" }}>✓</span>
                  <span style={{ color: "var(--vh-ink-soft)" }}>{item}</span>
                </div>
              ))}
            </div>
            <p className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
              It only takes a minute. You can also configure this later in Settings.
            </p>
          </div>
        )}

        {/* Step: Timezone */}
        {step === "timezone" && (
          <div className="space-y-4">
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--vh-ink-soft)" }}>
              Choose the timezone for your organization. This controls how election dates appear
              in emails, exports, and the admin interface.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wiz_tz">Timezone</Label>
              <select
                id="wiz_tz"
                value={tz}
                onChange={(e) => {
                  setTz(e.target.value)
                  if (e.target.value !== "__other__") setOtherTz("")
                  setTzError("")
                }}
                className={selectClass}
              >
                {COMMON_TIMEZONES.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
                <option value="__other__">Other (IANA name)…</option>
              </select>
              {tz === "__other__" && (
                <Input
                  placeholder="e.g. America/Toronto"
                  value={otherTz}
                  onChange={(e) => { setOtherTz(e.target.value); setTzError("") }}
                  className="bg-white mt-1.5"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              )}
            </div>
            {effectiveTz && tzPreview(effectiveTz) && (
              <div
                className="rounded-[10px] p-3 text-[12.5px]"
                style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
              >
                <span style={{ color: "var(--vh-muted)" }}>Now shows as: </span>
                <span style={{ color: "var(--vh-ink)" }}>{tzPreview(effectiveTz)}</span>
              </div>
            )}
            {tzError && (
              <p className="text-[12.5px]" style={{ color: "var(--vh-danger, #dc2626)" }}>
                {tzError}
              </p>
            )}
            <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>
              Timestamps are always stored in UTC — this is display-only. You can change it anytime in Settings.
            </p>
          </div>
        )}

        {/* Step: Credentials */}
        {step === "credentials" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wiz_preset">Email Provider</Label>
              <select
                id="wiz_preset"
                value={form.preset}
                onChange={(e) => applyPreset(e.target.value as EmailPreset | "")}
                className={selectClass}
              >
                <option value="" disabled>Choose email provider…</option>
                {PRESET_KEYS.map((k) => (
                  <option key={k} value={k}>{PRESETS[k].label}</option>
                ))}
              </select>
            </div>

            {preset && (
              <>
                <div
                  className="rounded-lg p-3 text-[12.5px]"
                  style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
                >
                  <div className="font-medium mb-1" style={{ color: "var(--vh-ink)" }}>{preset.tipTitle}</div>
                  <p style={{ color: "var(--vh-ink-soft)" }} className="leading-relaxed">
                    {preset.tipText}{" "}
                    {preset.tipUrl && (
                      <a
                        href={preset.tipUrl.href}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                        style={{ color: "var(--vh-accent)" }}
                      >
                        {preset.tipUrl.label}
                      </a>
                    )}
                  </p>
                </div>

                {form.preset === "resend" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="wiz_resend_key">Resend API Key</Label>
                    <Input
                      id="wiz_resend_key"
                      type="password"
                      placeholder="re_••••••••••••••••••••••"
                      value={form.resend_api_key}
                      onChange={(e) => setField("resend_api_key", e.target.value)}
                      autoComplete="off"
                      className="bg-white"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {form.preset === "smtp" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="wiz_smtp_host">SMTP Host</Label>
                        <Input
                          id="wiz_smtp_host"
                          type="url"
                          placeholder="smtp.example.com"
                          value={form.smtp_host}
                          onChange={(e) => setField("smtp_host", e.target.value)}
                          className="bg-white"
                        />
                      </div>
                    )}
                    {form.preset === "smtp" && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="wiz_smtp_port">Port</Label>
                          <Input
                            id="wiz_smtp_port"
                            type="number"
                            placeholder="587"
                            value={form.smtp_port}
                            onChange={(e) => setField("smtp_port", e.target.value)}
                            className="bg-white"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="wiz_smtp_secure">TLS Mode</Label>
                          <select
                            id="wiz_smtp_secure"
                            value={form.smtp_secure}
                            onChange={(e) => setField("smtp_secure", e.target.value)}
                            className={selectClass}
                          >
                            <option value="false">STARTTLS (587)</option>
                            <option value="true">Implicit TLS (465)</option>
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz_smtp_user">
                        {form.preset === "smtp" ? "Username" : "Email address"}
                      </Label>
                      <Input
                        id="wiz_smtp_user"
                        placeholder="you@example.com"
                        value={form.smtp_user}
                        onChange={(e) => setField("smtp_user", e.target.value)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wiz_smtp_pass">
                        {form.preset === "smtp" ? "Password" : "App Password"}
                      </Label>
                      <Input
                        id="wiz_smtp_pass"
                        type="password"
                        value={form.smtp_pass}
                        onChange={(e) => setField("smtp_pass", e.target.value)}
                        autoComplete="new-password"
                        className="bg-white"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step: Identity */}
        {step === "identity" && (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
              This is how voters will see the sender in their inbox.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wiz_from_name">From Name</Label>
              <Input
                id="wiz_from_name"
                placeholder={BRAND_NAME}
                value={form.email_from_name}
                onChange={(e) => setField("email_from_name", e.target.value)}
                autoComplete="off"
                className="bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz_from_address">From Address</Label>
              <Input
                id="wiz_from_address"
                type="email"
                placeholder="votes@yourdomain.com"
                value={form.email_from_address}
                onChange={(e) => setField("email_from_address", e.target.value)}
                autoComplete="email"
                className="bg-white"
              />
              <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>
                {form.preset === "resend"
                  ? "Must be a verified sender in your Resend account."
                  : "Most providers require this to match your SMTP username."}
              </p>
            </div>
            {form.email_from_name && form.email_from_address && (
              <div
                className="rounded-[10px] p-3 text-[12.5px]"
                style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
              >
                <span style={{ color: "var(--vh-muted)" }}>Voters will see: </span>
                <strong style={{ color: "var(--vh-ink)" }}>{form.email_from_name}</strong>
                <span style={{ color: "var(--vh-muted)" }}>{" <"}{form.email_from_address}{">"}</span>
              </div>
            )}
            {saveError && (
              <p className="text-[12.5px]" style={{ color: "var(--vh-danger, #dc2626)" }}>
                Failed to save: {saveError}
              </p>
            )}
          </div>
        )}

        {/* Step: Test */}
        {step === "test" && (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
              Send a sample invitation email to confirm everything is working.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wiz_test_to">Recipient</Label>
              <div className="flex gap-2">
                <Input
                  id="wiz_test_to"
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="bg-white"
                  disabled={testResult === "sent"}
                />
                <Button
                  variant="outline"
                  onClick={handleSendTest}
                  disabled={testing || !testTo || testResult === "sent"}
                  className="shrink-0"
                >
                  {testing ? "Sending…" : "Send test"}
                </Button>
              </div>
            </div>
            {testResult === "sent" && (
              <div
                className="flex items-start gap-2 rounded-[10px] p-3 text-[13px]"
                style={{ background: "var(--vh-success-soft)", border: "1px solid oklch(0.85 0.07 160)" }}
              >
                <span>✅</span>
                <span style={{ color: "var(--vh-ink)" }}>
                  Test email sent successfully. Check your inbox to confirm delivery.
                </span>
              </div>
            )}
            {testResult === "error" && (
              <div
                className="rounded-[10px] p-3 text-[13px]"
                style={{ background: "var(--vh-danger-soft, #fef2f2)", border: "1px solid oklch(0.85 0.05 15)" }}
              >
                <p className="font-medium" style={{ color: "var(--vh-danger, #dc2626)" }}>Send failed</p>
                <p className="mt-0.5" style={{ color: "var(--vh-ink-soft)" }}>{testError}</p>
                <button
                  className="mt-2 text-[12.5px] underline"
                  style={{ color: "var(--vh-accent)" }}
                  onClick={() => setStep("credentials")}
                >
                  Back to credentials
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-4 text-center py-2">
            <div className="text-5xl">✅</div>
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--vh-ink)" }}>
                Email is set up!
              </p>
              <p className="text-[13px] mt-1" style={{ color: "var(--vh-ink-soft)" }}>
                Voters will now receive ballot invitations and reminders.
                You can change these settings anytime in the Settings page.
              </p>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: "1px solid var(--vh-line)" }}>
          <div>
            {step !== "welcome" && step !== "timezone" && step !== "done" && (
              <button
                onClick={() => {
                  const idx = STEP_ORDER.indexOf(step)
                  if (idx > 0) setStep(STEP_ORDER[idx - 1])
                }}
                className="text-[13px] px-3 py-1.5 rounded-[8px] transition-colors"
                style={{ color: "var(--vh-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)"; (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}
                disabled={saving || skipping}
              >
                ← Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step !== "done" && (
              <button
                onClick={handleSkip}
                disabled={saving || skipping || savingTz}
                className="text-[13px] px-3 py-1.5 rounded-[8px] transition-colors"
                style={{ color: "var(--vh-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)"; (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                {skipping ? "Skipping…" : "Skip for now"}
              </button>
            )}

            {step === "welcome" && (
              <Button onClick={() => setStep("timezone")} size="lg">
                Get started
              </Button>
            )}
            {step === "timezone" && (
              <Button
                onClick={handleSaveTimezone}
                disabled={savingTz || !effectiveTz || (tz === "__other__" && !otherTz.trim())}
                size="lg"
              >
                {savingTz ? "Saving…" : "Confirm"}
              </Button>
            )}
            {step === "credentials" && (
              <Button onClick={() => setStep("identity")} disabled={!form.preset} size="lg">
                Next
              </Button>
            )}
            {step === "identity" && (
              <Button onClick={handleSaveAndContinue} disabled={saving} size="lg">
                {saving ? "Saving…" : "Save & continue"}
              </Button>
            )}
            {step === "test" && testResult === "sent" && (
              <Button onClick={async () => { await markSeen(); resetWizard(); onClose(true) }} size="lg">
                Finish
              </Button>
            )}
            {step === "test" && testResult !== "sent" && (
              <Button
                onClick={async () => { await markSeen(); resetWizard(); onClose(true) }}
                variant="outline"
                size="lg"
              >
                Skip test
              </Button>
            )}
            {step === "done" && (
              <Button onClick={handleFinish} size="lg">
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
