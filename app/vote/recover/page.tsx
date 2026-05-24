"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function VoterRecoverPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await fetch("/api/voter/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "1" },
        body: JSON.stringify({ email }),
      })
    } catch {
      // silent — always show success
    }
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--vh-bg)" }}>
      <div
        className="w-full max-w-sm rounded-[16px] p-8"
        style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
      >
        <h1 className="text-[20px] font-semibold mb-2" style={{ color: "var(--vh-ink)" }}>
          Get a fresh ballot link
        </h1>

        {submitted ? (
          <p className="text-[14px] leading-relaxed" style={{ color: "var(--vh-ink-soft)" }}>
            If your email matches a current election, a fresh link is on its way. Check your inbox.
          </p>
        ) : (
          <>
            <p className="text-[14px] mb-5 leading-relaxed" style={{ color: "var(--vh-ink-soft)" }}>
              Enter the email address you were invited with. If it matches an active election, we&apos;ll send you a working link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-[13px] font-medium mb-1.5"
                  style={{ color: "var(--vh-ink)" }}
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-[8px] px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-vh-accent"
                  style={{
                    background: "var(--vh-surface-2)",
                    border: "1px solid var(--vh-line-strong)",
                    color: "var(--vh-ink)",
                  }}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send me a link"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
