"use client"

import { useState } from "react"

export default function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={className}
      style={{
        padding: "6px 12px",
        borderRadius: "8px",
        fontSize: "12px",
        fontWeight: 500,
        border: "1px solid var(--vh-line-strong)",
        background: copied ? "var(--vh-success-soft)" : "var(--vh-surface-2)",
        color: copied ? "oklch(0.35 0.10 155)" : "var(--vh-ink-soft)",
        cursor: "pointer",
        transition: "background 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  )
}
