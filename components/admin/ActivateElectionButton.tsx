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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? "Failed to activate election.")
        setActivating(false)
        return
      }
      const { sent = 0, failed = 0, stopped = false, stopReason, failedAt } =
        body as { sent?: number; failed?: number; stopped?: boolean; stopReason?: string; failedAt?: string }
      if (stopped) {
        const detail = stopReason === "quota"
          ? `Email provider quota reached at ${failedAt ?? "unknown"}. Sent ${sent} of ${sent + failed}. Try again later or check your provider settings.`
          : `Sending stopped after repeated failures at ${failedAt ?? "unknown"}. Sent ${sent} of ${sent + failed}. Check email settings or server logs.`
        setError(`Activated, but ${detail}`)
        setActivating(false)
        onActivated?.()
        return
      }
      if (failed > 0) {
        setError(`Activated, but ${failed} of ${sent + failed} invitation(s) failed to send. Check email settings or server logs.`)
        setActivating(false)
        onActivated?.()
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
