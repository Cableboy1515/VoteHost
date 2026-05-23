"use client"

import { useEffect, useRef, useState } from "react"
import ActivationConfirmDialog from "@/components/admin/ActivationConfirmDialog"
import type { ActivationStatus } from "@/components/admin/InvitationProgress"

interface Props {
  electionId: string
  electionTitle: string
  uninvitedCount: number
  onActivated?: () => void
  onProgressTick?: () => void
  children: React.ReactNode
}

export default function ActivateElectionButton({
  electionId,
  electionTitle,
  uninvitedCount,
  onActivated,
  onProgressTick,
  children,
}: Props) {
  const [open, setOpen] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState("")
  const [progress, setProgress] = useState<ActivationStatus | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError("")
      if (!progress?.sending) {
        // Only fully reset if sending is done or not started
        setProgress(null)
        stopPolling()
        onActivated?.()
      }
    }
    setOpen(next)
  }

  function startProgressPolling() {
    stopPolling()

    async function poll() {
      try {
        const res = await fetch(`/api/elections/${electionId}/activation-status?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok) return
        const data: ActivationStatus = await res.json()
        setProgress(data)
        onProgressTick?.()
        if (!data.sending) {
          stopPolling()
          onActivated?.()
        }
      } catch {}
    }

    poll() // immediate first fetch — don't wait 2 s
    intervalRef.current = setInterval(poll, 2000)
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
      setActivating(false)
      const initial: ActivationStatus = {
        total: body.total ?? 0,
        invited: 0,
        failed: 0,
        sending: true,
        stopped: false,
      }
      setProgress(initial)
      startProgressPolling()
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
        progress={progress}
      />
    </>
  )
}
