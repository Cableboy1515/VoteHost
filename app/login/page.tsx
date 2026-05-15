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

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusReady = searchParams.get("status") === "ready"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [showForgot, setShowForgot] = useState(false)
  const [resetEmail, setResetEmail] = useState("")
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    setLoading(false)
    if (res.ok) {
      router.push("/dashboard")
    } else {
      setError("Invalid email or password")
    }
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
                    If your account exists, an administrator has been notified.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
                      Enter your email and an administrator will be notified to send you a new setup link.
                    </p>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
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
                      {resetLoading ? "Sending…" : "Send request"}
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
