"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function ArchiveElectionButton({ id, archived }: { id: string; archived: boolean }) {
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
    <Button variant="outline" size="sm" onClick={handleToggle} disabled={loading}>
      {loading
        ? archived ? "Unarchiving…" : "Archiving…"
        : archived ? "Unarchive" : "Archive"}
    </Button>
  )
}
