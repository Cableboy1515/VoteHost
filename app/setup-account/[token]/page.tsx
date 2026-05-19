"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import { passwordStrength, STRENGTH_COLOR } from "@/lib/password-strength"

export default function SetupAccountPage() {
  const { token } = useParams<{ token: string }>()

  const [email, setEmail] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [loading, setLoading] = useState(true)

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const strength = passwordStrength(password)

  useEffect(() => {
    fetch(`/api/setup/${token}`)
      .then(async (res) => {
        if (!res.ok) { setExpired(true); setLoading(false); return }
        const d = await res.json()
        setEmail(d.email)
        setExpired(d.expired)
        setLoading(false)
      })
      .catch(() => { setExpired(true); setLoading(false) })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) { setError("Passwords do not match"); return }
    setSubmitting(true)
    setError("")
    const res = await fetch(`/api/setup/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    setSubmitting(false)
    if (res.ok) {
      window.location.href = "/"
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Something went wrong")
    }
  }

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

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{ background: "var(--vh-bg)" }}
    >
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-6">
          <BrandMark size={36} />
        </div>

        <div
          className="bg-vh-surface rounded-[20px] p-8"
          style={{ boxShadow: "var(--vh-shadow-md)", border: "1px solid var(--vh-line)" }}
        >
          {loading ? (
            <p className="text-[14px] text-center" style={{ color: "var(--vh-muted)" }}>Verifying link…</p>
          ) : expired || !email ? (
            <div className="text-center">
              <p className="text-[16px] font-semibold mb-2">Link expired or invalid</p>
              <p className="text-[13px] mb-5" style={{ color: "var(--vh-muted)" }}>
                This setup link has expired or already been used. Ask your administrator to send a new one.
              </p>
              <a
                href="/login"
                className="text-[13px] font-medium"
                style={{ color: "var(--vh-accent)" }}
              >
                ← Back to sign in
              </a>
            </div>
          ) : (
            <>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-[12.5px] mb-5"
                style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }}
              >
                <span className="text-sm">🔑</span>
                Setting up <strong className="font-medium">{email}</strong>
              </div>

              <h2 className="text-[20px] font-semibold mb-1">Choose a password</h2>
              <p className="text-[13px] mb-5" style={{ color: "var(--vh-muted)" }}>
                At least 8 characters.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <div>
                  <label htmlFor="password" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                  {password.length > 0 && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className="flex-1 h-1 rounded-full transition-colors"
                            style={{ background: i <= strength.segments ? STRENGTH_COLOR[strength.segments] : "var(--vh-surface-3)" }}
                          />
                        ))}
                      </div>
                      <div className="text-[11.5px] mt-1.5" style={{ color: "var(--vh-muted)" }}>{strength.label}</div>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                    style={inputStyle}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {error && (
                  <p className="text-[13px]" style={{ color: "var(--vh-danger)" }}>{error}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors mt-0.5 disabled:opacity-60"
                  style={{ background: "var(--vh-accent)" }}
                  onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
                >
                  {submitting ? "Saving…" : "Save and sign in"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
