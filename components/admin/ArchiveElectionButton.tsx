"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function ArchiveElectionButton({ id, archived, electionStatus }: { id: string; archived: boolean; electionStatus: "DRAFT" | "ACTIVE" | "COMPLETED" }) {
  if (!archived && electionStatus !== "COMPLETED") return null
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleToggle() {
    setLoading(true)
    await fetch(`/api/elections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    })
    setLoading(false)
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium text-white transition-colors disabled:opacity-60"
      style={{ background: "var(--vh-ink)", border: "1px solid var(--vh-ink)" }}
      onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = "var(--vh-ink-soft)" }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-ink)" }}
    >
      {loading
        ? archived ? "Unarchiving…" : "Archiving…"
        : archived ? "Unarchive" : "Archive"}
    </button>
  )
}
