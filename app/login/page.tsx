"use client"

import { Suspense, useState } from "react"
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

type Step = "credentials" | "totp" | "recovery"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusReady = searchParams.get("status") === "ready"
  const nextPath = safeNext(searchParams.get("next"))

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [showForgot, setShowForgot] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // 2FA state
  const [step, setStep] = useState<Step>("credentials")
  const [challengeToken, setChallengeToken] = useState("")
  const [totpCode, setTotpCode] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))

    setLoading(false)

    if (!res.ok) {
      setError("Invalid email or password")
      return
    }

    if (data.recommend2fa) {
      router.push(`/login/enroll?next=${encodeURIComponent(nextPath)}`)
      return
    }

    if (data.totpRequired) {
      setChallengeToken(data.challengeToken)
      setStep("totp")
      return
    }

    router.push(nextPath)
  }

  async function handleTotpVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const body: Record<string, string> = { challengeToken }
    if (step === "totp") body.code = totpCode
    else body.recoveryCode = recoveryCode

    const res = await fetch("/api/admin/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))

    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "Incorrect code")
      return
    }

    router.push(nextPath)
  }

  async function handleResetRequest() {
    if (!resetEmail) return
    setResetLoading(true)
    await fetch("/api/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resetEmail }),
    }).catch(() => {})
    setResetLoading(false)
    setResetSent(true)
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{ background: "linear-gradient(160deg, var(--vh-bg) 0%, var(--vh-surface-2) 100%)" }}
    >
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-7">
          <BrandMark size={44} />
        </div>

        <div
          className="bg-vh-surface rounded-[20px] p-8"
          style={{ boxShadow: "var(--vh-shadow-md)", border: "1px solid var(--vh-line)" }}
        >
          {step === "credentials" && (
            <>
              {statusReady && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-[12.5px] mb-5"
                  style={{ background: "var(--vh-success-soft)", color: "var(--vh-success)" }}
                >
                  <span>✓</span> Your password is set — sign in below.
                </div>
              )}

              <h2 className="text-[22px] font-semibold mb-1.5">Welcome back</h2>
              <p className="text-[13.5px] mb-6" style={{ color: "var(--vh-muted)" }}>
                Sign in to manage your elections
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="email" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="email"
                    className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowForgot(!showForgot); setResetSent(false); setResetEmail("") }}
                    className="mt-2 text-[12px] transition-colors"
                    style={{ color: "var(--vh-muted)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vh-accent)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vh-muted)")}
                  >
                    Forgot password?
                  </button>
                </div>

                {showForgot && (
                  <div
                    className="rounded-[10px] p-3.5"
                    style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
                  >
                    {resetSent ? (
                      <p className="text-[12.5px]" style={{ color: "var(--vh-ink-soft)" }}>
                        If your account exists, we&apos;ve emailed you a reset link. It expires in 1 hour.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
                          Enter your email and we&apos;ll send you a link to reset your password.
                        </p>
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          placeholder="you@example.com"
                          autoComplete="email"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          inputMode="email"
                          className="w-full text-sm rounded-[8px] px-3 py-2 transition-colors"
                          style={inputStyle}
                          onFocus={onFocus}
                          onBlur={onBlur}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleResetRequest() } }}
                        />
                        <button
                          type="button"
                          onClick={handleResetRequest}
                          disabled={resetLoading || !resetEmail}
                          className="text-[12.5px] font-medium py-2 rounded-[8px] transition-colors disabled:opacity-60"
                          style={{ background: "var(--vh-accent)", color: "#fff" }}
                        >
                          {resetLoading ? "Sending…" : "Send reset link"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors mt-0.5 disabled:opacity-60"
                  style={{ background: "var(--vh-accent)" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
                >
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </form>
            </>
          )}

          {(step === "totp" || step === "recovery") && (
            <>
              <h2 className="text-[22px] font-semibold mb-1.5">Two-factor verification</h2>
              <p className="text-[13.5px] mb-6" style={{ color: "var(--vh-muted)" }}>
                {step === "totp"
                  ? "Enter the 6-digit code from your authenticator app."
                  : "Enter one of your recovery codes."}
              </p>

              <form onSubmit={handleTotpVerify} className="flex flex-col gap-3.5">
                {step === "totp" ? (
                  <div>
                    <label htmlFor="totpCode" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                      Authenticator code
                    </label>
                    <input
                      id="totpCode"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      required
                      autoFocus
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors tracking-[0.25em] text-center font-mono"
                      style={inputStyle}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="recoveryCode" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                      Recovery code
                    </label>
                    <input
                      id="recoveryCode"
                      type="text"
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      required
                      autoFocus
                      placeholder="XXXXXX-XXXXXX"
                      className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors font-mono"
                      style={inputStyle}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                    <p className="text-[12px] mt-1.5" style={{ color: "var(--vh-muted)" }}>
                      Each recovery code can only be used once.
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: "var(--vh-accent)" }}
                  onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
                >
                  {loading ? "Verifying…" : "Verify"}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep(step === "totp" ? "recovery" : "totp"); setError(""); setTotpCode(""); setRecoveryCode("") }}
                  className="text-[12.5px] text-center transition-colors"
                  style={{ color: "var(--vh-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--vh-accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--vh-muted)")}
                >
                  {step === "totp" ? "Use a recovery code instead" : "Use authenticator app instead"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
