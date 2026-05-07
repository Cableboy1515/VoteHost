"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"

function passwordStrength(pw: string): { segments: number; label: string } {
  if (!pw) return { segments: 0, label: "" }
  const hasUpper = /[A-Z]/.test(pw)
  const hasNumber = /[0-9]/.test(pw)
  const hasSpecial = /[^A-Za-z0-9]/.test(pw)
  if (pw.length >= 12 && hasUpper && hasNumber && hasSpecial) return { segments: 4, label: "Strong" }
  if (pw.length >= 12 && (hasUpper || hasNumber)) return { segments: 3, label: "Good" }
  if (pw.length >= 8) return { segments: 2, label: "Fair" }
  return { segments: 1, label: "Weak" }
}

const STRENGTH_COLOR: Record<number, string> = {
  1: "var(--vh-danger)",
  2: "var(--vh-warn)",
  3: "oklch(0.60 0.13 155)",
  4: "var(--vh-success)",
}

export default function ChangePasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const strength = passwordStrength(newPassword)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "", newPassword, confirmPassword }),
    })

    setLoading(false)
    if (res.ok) {
      router.push("/admin/dashboard")
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Failed to update password")
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
          <BrandMark size={28} />
        </div>

        <div
          className="bg-vh-surface rounded-[20px] p-8"
          style={{ boxShadow: "var(--vh-shadow-md)", border: "1px solid var(--vh-line)" }}
        >
          {/* Banner */}
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-[12.5px] mb-5"
            style={{
              background: "var(--vh-accent-soft)",
              color: "var(--vh-accent-strong)",
            }}
          >
            <span className="text-sm">🔑</span>
            You&apos;re using a temporary password. Set a new one to continue.
          </div>

          <h2 className="text-[20px] font-semibold mb-1">Choose a new password</h2>
          <p className="text-[13px] mb-5" style={{ color: "var(--vh-muted)" }}>
            At least 8 characters.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: "var(--vh-ink-soft)" }}
              >
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
                className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              {newPassword.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="flex-1 h-1 rounded-full transition-colors"
                        style={{
                          background: i <= strength.segments
                            ? STRENGTH_COLOR[strength.segments]
                            : "var(--vh-surface-3)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-[11.5px] mt-1.5" style={{ color: "var(--vh-muted)" }}>
                    {strength.label}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: "var(--vh-ink-soft)" }}
              >
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

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
              {loading ? "Saving…" : "Save and continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
