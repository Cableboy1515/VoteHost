"use client"

import { useState } from "react"

const inputStyle = {
  border: "1px solid var(--vh-line-strong)",
  background: "var(--vh-surface)",
  color: "var(--vh-ink)",
  outline: "none",
}

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = "var(--vh-accent)"
  e.target.style.boxShadow = "var(--vh-ring)"
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.borderColor = "var(--vh-line-strong)"
  e.target.style.boxShadow = "none"
}

type EnrollStep = "idle" | "scan" | "recovery"

interface Props {
  totpEnabled: boolean
  totpEnabledAt: string | null
  recoveryCodesRemaining: number
  role: string
}

export default function SecurityPanel({ totpEnabled: initialEnabled, totpEnabledAt, recoveryCodesRemaining: initialRemaining, role }: Props) {
  const [totpEnabled, setTotpEnabled] = useState(initialEnabled)
  const [codesRemaining, setCodesRemaining] = useState(initialRemaining)

  // Enrollment state
  const [enrollStep, setEnrollStep] = useState<EnrollStep>("idle")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [enrollError, setEnrollError] = useState("")
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [showManualKey, setShowManualKey] = useState(false)

  // Disable state
  const [showDisable, setShowDisable] = useState(false)
  const [disableCode, setDisableCode] = useState("")
  const [disableError, setDisableError] = useState("")
  const [disableLoading, setDisableLoading] = useState(false)

  const shouldRecommend = (role === "ADMIN" || role === "ORGANIZER") && !totpEnabled

  async function startEnroll() {
    setEnrollLoading(true)
    setEnrollError("")
    const res = await fetch("/api/admin/2fa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const data = await res.json().catch(() => ({}))
    setEnrollLoading(false)
    if (!res.ok) { setEnrollError(data.error ?? "Failed to start enrollment"); return }
    setQrDataUrl(data.qrDataUrl)
    setSecret(data.secret)
    setCode("")
    setEnrollStep("scan")
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    setEnrollLoading(true)
    setEnrollError("")
    const res = await fetch("/api/admin/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code }),
    })
    const data = await res.json().catch(() => ({}))
    setEnrollLoading(false)
    if (!res.ok) { setEnrollError(data.error ?? "Incorrect code — try again"); return }
    setRecoveryCodes(data.recoveryCodes ?? [])
    setCodesRemaining(data.recoveryCodes?.length ?? 10)
    setTotpEnabled(true)
    setEnrollStep("recovery")
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    setDisableLoading(true)
    setDisableError("")
    const res = await fetch("/api/admin/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: disableCode }),
    })
    const data = await res.json().catch(() => ({}))
    setDisableLoading(false)
    if (!res.ok) { setDisableError(data.error ?? "Failed to disable 2FA"); return }
    setTotpEnabled(false)
    setShowDisable(false)
    setDisableCode("")
    setCodesRemaining(0)
    setEnrollStep("idle")
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Two-factor authentication</h2>
        <p className="text-sm mb-6" style={{ color: "var(--vh-muted)" }}>
          {role === "ADMIN" || role === "ORGANIZER"
            ? "Recommended for your account. Adds a time-based code from your authenticator app to the login flow."
            : "Optional for your account. Adds a time-based code from your authenticator app to the login flow."}
        </p>

        {/* Status badge */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium mb-6"
          style={{
            background: totpEnabled ? "var(--vh-success-soft)" : "var(--vh-surface-2)",
            color: totpEnabled ? "var(--vh-success)" : "var(--vh-muted)",
            border: `1px solid ${totpEnabled ? "var(--vh-success-soft)" : "var(--vh-line)"}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: totpEnabled ? "var(--vh-success)" : "var(--vh-muted)" }}
          />
          {totpEnabled
            ? `Enabled${totpEnabledAt ? ` · since ${new Date(totpEnabledAt).toLocaleDateString()}` : ""}`
            : shouldRecommend ? "Recommended — not yet set up" : "Disabled"}
        </div>

        {/* === Enrollment flow === */}
        {!totpEnabled && enrollStep === "idle" && (
          <div>
            {shouldRecommend && (
              <div
                className="px-4 py-3 rounded-[10px] mb-4 text-[13px]"
                style={{ background: "var(--vh-surface-2)", color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line)" }}
              >
                We strongly recommend enabling two-factor authentication for your account.
              </div>
            )}
            <button
              onClick={startEnroll}
              disabled={enrollLoading}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-60"
              style={{ background: "var(--vh-accent)" }}
              onMouseEnter={(e) => { if (!enrollLoading) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
            >
              {enrollLoading ? "Loading…" : "Set up authenticator"}
            </button>
            {enrollError && <p className="text-[13px] mt-2" style={{ color: "var(--vh-danger)" }}>{enrollError}</p>}
          </div>
        )}

        {!totpEnabled && enrollStep === "scan" && (
          <div
            className="rounded-[16px] p-6"
            style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
          >
            <h3 className="text-[15px] font-semibold mb-2">Scan the QR code</h3>
            <p className="text-[13px] mb-4" style={{ color: "var(--vh-muted)" }}>
              Open your authenticator app (Google Authenticator, Authy, 1Password…) and scan this code.
            </p>

            {qrDataUrl && (
              <div className="flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="TOTP QR code"
                  width={180}
                  height={180}
                  className="rounded-[10px]"
                  style={{ border: "1px solid var(--vh-line)", imageRendering: "pixelated" }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowManualKey(!showManualKey)}
              className="text-[12.5px] w-full text-center mb-3 transition-colors"
              style={{ color: "var(--vh-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vh-accent)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vh-muted)")}
            >
              {showManualKey ? "Hide manual key" : "Can't scan? Show manual key"}
            </button>

            {showManualKey && secret && (
              <div
                className="rounded-[10px] px-4 py-3 mb-4 text-center"
                style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
              >
                <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--vh-muted)" }}>Manual entry key</p>
                <code className="text-[13px] font-mono break-all select-all" style={{ color: "var(--vh-ink)" }}>
                  {secret.match(/.{1,4}/g)?.join(" ")}
                </code>
              </div>
            )}

            <form onSubmit={handleConfirm} className="flex flex-col gap-3">
              <div>
                <label htmlFor="enrollCode" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                  Verification code
                </label>
                <input
                  id="enrollCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-full max-w-[180px] text-sm rounded-[10px] px-3 py-2.5 transition-colors tracking-[0.25em] text-center font-mono"
                  style={inputStyle}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
              </div>

              {enrollError && <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>{enrollError}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enrollLoading || code.length < 6}
                  className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: "var(--vh-accent)" }}
                  onMouseEnter={(e) => { if (!enrollLoading) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
                >
                  {enrollLoading ? "Verifying…" : "Activate 2FA"}
                </button>
                <button
                  type="button"
                  onClick={() => { setEnrollStep("idle"); setCode(""); setEnrollError(""); setShowManualKey(false) }}
                  className="px-4 py-2.5 rounded-[10px] text-[14px] transition-colors"
                  style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)", color: "var(--vh-ink-soft)" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {enrollStep === "recovery" && (
          <div
            className="rounded-[16px] p-6"
            style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-[8px] text-[12.5px] mb-4"
              style={{ background: "var(--vh-success-soft)", color: "var(--vh-success)" }}
            >
              <span>✓</span> 2FA is now active on your account.
            </div>
            <h3 className="text-[15px] font-semibold mb-1.5">Save your recovery codes</h3>
            <p className="text-[13px] mb-4" style={{ color: "var(--vh-muted)" }}>
              Each code can only be used once. Store them somewhere safe — you&apos;ll need them if you lose access to your authenticator.
            </p>
            <div
              className="rounded-[10px] p-4 mb-4"
              style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
            >
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((c) => (
                  <code key={c} className="text-[13px] font-mono text-center py-0.5" style={{ color: "var(--vh-ink)" }}>
                    {c}
                  </code>
                ))}
              </div>
            </div>
            <button
              onClick={() => setEnrollStep("idle")}
              className="text-[13px] transition-colors"
              style={{ color: "var(--vh-accent)" }}
            >
              Done — I&apos;ve saved these codes
            </button>
          </div>
        )}

        {/* === Disable flow (only when 2FA is active) === */}
        {totpEnabled && !showDisable && enrollStep === "idle" && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-[12px] px-4 py-3 text-[13px]"
              style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
            >
              <span style={{ color: "var(--vh-ink-soft)" }}>Recovery codes remaining: </span>
              <strong style={{ color: codesRemaining <= 2 ? "var(--vh-danger)" : "var(--vh-ink)" }}>
                {codesRemaining}
              </strong>
            </div>
            <button
              onClick={() => { setShowDisable(true); setDisableCode(""); setDisableError("") }}
              className="text-[13px] transition-colors self-start"
              style={{ color: "var(--vh-danger)" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Disable two-factor authentication
            </button>
          </div>
        )}

        {totpEnabled && showDisable && (
          <div
            className="rounded-[16px] p-6"
            style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
          >
            <h3 className="text-[15px] font-semibold mb-1.5">Disable 2FA</h3>
            <p className="text-[13px] mb-4" style={{ color: "var(--vh-muted)" }}>
              Enter your current authenticator code to confirm.
            </p>
            <form onSubmit={handleDisable} className="flex flex-col gap-3">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full max-w-[180px] text-sm rounded-[10px] px-3 py-2.5 transition-colors tracking-[0.25em] text-center font-mono"
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              {disableError && <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>{disableError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={disableLoading || disableCode.length < 6}
                  className="px-4 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: "var(--vh-danger)" }}
                >
                  {disableLoading ? "Disabling…" : "Disable 2FA"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowDisable(false); setDisableCode(""); setDisableError("") }}
                  className="px-4 py-2.5 rounded-[10px] text-[14px] transition-colors"
                  style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)", color: "var(--vh-ink-soft)" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
