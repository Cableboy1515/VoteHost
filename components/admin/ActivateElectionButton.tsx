"use client"

import { useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

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
  const [checked, setChecked] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState("")

  function handleOpen() {
    setChecked(false)
    setError("")
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
    setChecked(false)
    setError("")
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
      handleClose()
      onActivated?.()
    } catch {
      setError("Network error — please try again.")
      setActivating(false)
    }
  }

  const inviteNote =
    uninvitedCount > 0
      ? `${uninvitedCount} invitation${uninvitedCount !== 1 ? "s" : ""} will be sent to voters who haven't been invited yet.`
      : "All voters have already been invited."

  return (
    <>
      <span onClick={handleOpen} style={{ display: "contents" }}>
        {children}
      </span>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Activate &ldquo;{electionTitle}&rdquo;?</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-zinc-600">
              Voting will open immediately. {inviteNote} This can be reversed by moving the election
              back to Draft.
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-zinc-600">
                I&apos;ve reviewed the ballot and voter list.
              </span>
            </label>
            {error && (
              <p className="text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleActivate} disabled={!checked || activating}>
              {activating ? "Activating…" : "Activate now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
