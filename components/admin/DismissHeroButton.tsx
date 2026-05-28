"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function DismissHeroButton({ electionId }: { electionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleDismiss() {
    if (pending) return
    setPending(true)
    try {
      await fetch(`/api/elections/${electionId}/dismiss-hero`, { method: "POST" })
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDismiss}
      disabled={pending}
      className="inline-flex items-center justify-center px-2.5 py-1 rounded-[8px] text-[12px] transition-colors"
      style={{
        background: "rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.75)",
        border: "1px solid rgba(255,255,255,0.2)",
        opacity: pending ? 0.6 : 1,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.20)" }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)" }}
    >
      Dismiss
    </button>
  )
}
