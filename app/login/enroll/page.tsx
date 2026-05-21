"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"

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

function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard"
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard"
  return raw
}

type EnrollStep = "loading" | "scan" | "verify" | "recovery"

function EnrollForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const challengeToken = searchParams.get("ct") ?? ""
  const nextPath = safeNext(searchParams.get("next"))

  const [step, setStep] = useState<EnrollStep>("loading")
  const [qrDataUrl, setQrDataUrl] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [showManualKey, setShowManualKey] = useState(false)

  useEffect(() => {
    if (!challengeToken) {
      router.replace("/login")
      return
    }
    fetch("/api/admin/2fa/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { router.replace("/login"); return }
        setQrDataUrl(data.qrDataUrl)
        setSecret(data.secret)
        setStep("scan")
      })
      .catch(() => router.replace("/login"))
  }, [challengeToken, router])

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/admin/2fa/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken, secret, code }),
    })
    const data = await res.json().catch(() => ({}))

    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Incorrect code — try again")
      return
    }

    setRecoveryCodes(data.recoveryCodes ?? [])
    setStep("recovery")
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{ background: "linear-gradient(160deg, var(--vh-bg) 0%, var(--vh-surface-2) 100%)" }}
    >
      <div className="w-full max-w-[420px]">
        <div className="flex justify-center mb-7">
          <BrandMark size={44} />
        </div>

        <div
          className="bg-vh-surface rounded-[20px] p-8"
          style={{ boxShadow: "var(--vh-shadow-md)", border: "1px solid var(--vh-line)" }}
        >
          {step === "loading" && (
            <p className="text-[14px] text-center" style={{ color: "var(--vh-muted)" }}>Setting up…</p>
          )}

          {step === "scan" && (
            <>
              <h2 className="text-[22px] font-semibold mb-1.5">Set up two-factor authentication</h2>
              <p className="text-[13.5px] mb-5" style={{ color: "var(--vh-muted)" }}>
                Two-factor authentication is required for your account. Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.).
              </p>

              {qrDataUrl && (
                <div className="flex justify-center mb-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR code"
                    width={200}
                    height={200}
                    className="rounded-[12px]"
                    style={{ border: "1px solid var(--vh-line)", imageRendering: "pixelated" }}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowManualKey(!showManualKey)}
                className="text-[12.5px] w-full text-center mb-4 transition-colors"
                style={{ color: "var(--vh-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vh-accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vh-muted)")}
              >
                {showManualKey ? "Hide manual key" : "Can't scan? Show manual key"}
              </button>

              {showManualKey && secret && (
                <div
                  className="rounded-[10px] px-4 py-3 mb-4 text-center"
                  style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
                >
                  <p className="text-[11px] uppercase tracking-wide mb-1.5" style={{ color: "var(--vh-muted)" }}>Manual entry key</p>
                  <code
                    className="text-[13px] font-mono break-all select-all"
                    style={{ color: "var(--vh-ink)" }}
                  >
                    {secret.match(/.{1,4}/g)?.join(" ")}
                  </code>
                </div>
              )}

              <form onSubmit={handleConfirm} className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="code" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                    Verification code
                  </label>
                  <input
                    id="code"
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
                    className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors tracking-[0.25em] text-center font-mono"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  <p className="text-[12px] mt-1.5" style={{ color: "var(--vh-muted)" }}>
                    Enter the 6-digit code shown in your app to confirm setup.
                  </p>
                </div>

                {error && (
                  <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length < 6}
                  className="w-full py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: "var(--vh-accent)" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
                >
                  {loading ? "Verifying…" : "Activate 2FA"}
                </button>
              </form>
            </>
          )}

          {step === "recovery" && (
            <>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-[12.5px] mb-5"
                style={{ background: "var(--vh-success-soft)", color: "var(--vh-success)" }}
              >
                <span>✓</span> Two-factor authentication is now active.
              </div>

              <h2 className="text-[20px] font-semibold mb-1.5">Save your recovery codes</h2>
              <p className="text-[13.5px] mb-4" style={{ color: "var(--vh-muted)" }}>
                If you lose access to your authenticator app, you can use these codes to sign in. Each code can only be used once. Store them somewhere safe.
              </p>

              <div
                className="rounded-[12px] p-4 mb-5"
                style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
              >
                <div className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c) => (
                    <code key={c} className="text-[13px] font-mono text-center py-1" style={{ color: "var(--vh-ink)" }}>
                      {c}
                    </code>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push(nextPath)}
                className="w-full py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors"
                style={{ background: "var(--vh-accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--vh-accent-strong)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--vh-accent)")}
              >
                Continue to dashboard
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function EnrollPage() {
  return (
    <Suspense>
      <EnrollForm />
    </Suspense>
  )
}
