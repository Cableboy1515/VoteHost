"use client"

import { useState } from "react"

export default function ReceiptLookupForm({
  electionId,
  initialCode,
  timeZone,
}: {
  electionId: string
  initialCode?: string
  timeZone: string
}) {
  const [code, setCode] = useState(initialCode ?? "")
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "not-found" | "error">("idle")
  const [foundAt, setFoundAt] = useState<string | null>(null)

  async function lookup() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setStatus("loading")
    setFoundAt(null)
    try {
      const res = await fetch(
        `/api/verify/${electionId}/receipt?code=${encodeURIComponent(trimmed)}`
      )
      if (!res.ok) {
        setStatus("error")
        return
      }
      const data = await res.json()
      if (data.found) {
        setStatus("found")
        setFoundAt(data.createdAt ?? null)
      } else {
        setStatus("not-found")
      }
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            if (status !== "idle") setStatus("idle")
          }}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="characters"
          maxLength={20}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "10px",
            border: "1px solid var(--vh-line-strong)",
            background: "var(--vh-surface-2)",
            fontFamily: "monospace",
            fontSize: "15px",
            letterSpacing: "0.05em",
            color: "var(--vh-ink)",
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={lookup}
          disabled={status === "loading" || !code.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: "10px",
            border: "none",
            background: "var(--vh-accent)",
            color: "white",
            fontWeight: 500,
            fontSize: "14px",
            cursor: status === "loading" || !code.trim() ? "not-allowed" : "pointer",
            opacity: status === "loading" || !code.trim() ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {status === "loading" ? "Checking…" : "Check"}
        </button>
      </div>

      {status === "found" && (
        <div
          className="rounded-[10px] px-4 py-3 text-[13px]"
          style={{ background: "var(--vh-success-soft)", border: "1px solid oklch(0.78 0.08 155)", color: "oklch(0.30 0.10 155)" }}
        >
          ✓ Ballot found — this receipt code is recorded in this election.
          {foundAt && (
            <span style={{ opacity: 0.75 }}>
              {" "}Recorded {new Date(foundAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone })}.
            </span>
          )}
        </div>
      )}

      {status === "not-found" && (
        <div
          className="rounded-[10px] px-4 py-3 text-[13px]"
          style={{ background: "var(--vh-surface-3)", border: "1px solid var(--vh-line-strong)", color: "var(--vh-ink-soft)" }}
        >
          Receipt code not found. Double-check the code and try again.
        </div>
      )}

      {status === "error" && (
        <div
          className="rounded-[10px] px-4 py-3 text-[13px]"
          style={{ background: "var(--vh-surface-3)", border: "1px solid var(--vh-danger)", color: "var(--vh-danger)" }}
        >
          Something went wrong. Please try again.
        </div>
      )}
    </div>
  )
}
