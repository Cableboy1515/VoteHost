"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

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
      const data = await res.json().catch(() => ({}))
      router.push(data.mustChangePassword ? "/admin/change-password" : "/admin/dashboard")
    } else {
      setError("Invalid email or password")
    }
  }

  return (
    <div
      className="min-h-screen grid place-items-center p-6"
      style={{ background: "linear-gradient(160deg, var(--vh-bg) 0%, var(--vh-surface-2) 100%)" }}
    >
      <div className="w-full max-w-[380px]">
        <div className="flex justify-center mb-7">
          <BrandMark size={32} />
        </div>

        <div
          className="bg-vh-surface rounded-[20px] p-8"
          style={{ boxShadow: "var(--vh-shadow-md)", border: "1px solid var(--vh-line)" }}
        >
          <h2 className="text-[22px] font-semibold mb-1.5">Welcome back</h2>
          <p className="text-[13.5px] mb-6" style={{ color: "var(--vh-muted)" }}>
            Sign in to manage your elections
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div>
              <label
                htmlFor="email"
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: "var(--vh-ink-soft)" }}
              >
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
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  background: "var(--vh-surface)",
                  color: "var(--vh-ink)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--vh-accent)"
                  e.target.style.boxShadow = "var(--vh-ring)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--vh-line-strong)"
                  e.target.style.boxShadow = "none"
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[13px] font-medium mb-1.5"
                style={{ color: "var(--vh-ink-soft)" }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  background: "var(--vh-surface)",
                  color: "var(--vh-ink)",
                  outline: "none",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--vh-accent)"
                  e.target.style.boxShadow = "var(--vh-ring)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--vh-line-strong)"
                  e.target.style.boxShadow = "none"
                }}
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
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-[12.5px] text-center mt-5" style={{ color: "var(--vh-muted)" }}>
          Trouble signing in?{" "}
          <span style={{ color: "var(--vh-accent)" }}>Contact your administrator</span>
        </p>
      </div>
    </div>
  )
}
