"use client"

import { useState } from "react"
import ActivationConfirmDialog from "@/components/admin/ActivationConfirmDialog"

interface Props {
  electionId: string
  electionTitle: string
  uninvitedCount: number
  onActivated?: () => void
  children: React.ReactNode
}

export default function ActivateElectionButton({
  electionId,
  electionTitle,
  uninvitedCount,
  onActivated,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState("")

  function handleOpenChange(next: boolean) {
    if (!next) setError("")
    setOpen(next)
  }

  async function handleActivate() {
    setActivating(true)
    setError("")
    try {
      const res = await fetch(`/api/elections/${electionId}/activate`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? "Failed to activate election.")
        setActivating(false)
        return
      }
      setOpen(false)
      onActivated?.()
    } catch {
      setError("Network error — please try again.")
      setActivating(false)
    }
  }

  return (
    <>
      <span onClick={() => { setError(""); setOpen(true) }} style={{ display: "contents" }}>
        {children}
      </span>
      <ActivationConfirmDialog
        open={open}
        onOpenChange={handleOpenChange}
        electionTitle={electionTitle}
        uninvitedCount={uninvitedCount}
        onConfirm={handleActivate}
        confirming={activating}
        error={error}
      />
    </>
  )
}
