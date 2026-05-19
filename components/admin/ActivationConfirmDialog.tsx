"use client"

import { useEffect, useState } from "react"
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
  open: boolean
  onOpenChange: (open: boolean) => void
  electionTitle: string
  uninvitedCount: number
  onConfirm: () => Promise<void>
  confirming: boolean
  error?: string
}

export default function ActivationConfirmDialog({
  open,
  onOpenChange,
  electionTitle,
  uninvitedCount,
  onConfirm,
  confirming,
  error,
}: Props) {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  const inviteNote =
    uninvitedCount > 0
      ? `${uninvitedCount} invitation${uninvitedCount !== 1 ? "s" : ""} will be sent to voters who haven't been invited yet.`
      : "All voters have already been invited."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Activate &ldquo;{electionTitle}&rdquo;?</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-zinc-600">
            Voting will open immediately.{" "}{inviteNote}{" "}This can be reversed by moving the
            election back to Draft, but voters will still receive a link to vote. Be sure
            you&apos;re ready to activate.
          </p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
            />
            <span className="text-sm text-zinc-600">
              I&apos;ve reviewed the ballot and voter list and I&apos;m ready to activate.
            </span>
          </label>
          {error && (
            <p className="text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={onConfirm} disabled={!checked || confirming}>
            {confirming ? "Activating…" : "Activate now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
