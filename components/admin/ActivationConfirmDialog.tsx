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
import InvitationProgress, { type ActivationStatus } from "@/components/admin/InvitationProgress"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  electionTitle: string
  uninvitedCount: number
  onConfirm: () => Promise<void>
  confirming: boolean
  error?: string
  progress?: ActivationStatus | null
}

export default function ActivationConfirmDialog({
  open,
  onOpenChange,
  electionTitle,
  uninvitedCount,
  onConfirm,
  confirming,
  error,
  progress,
}: Props) {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (open) setChecked(false)
  }, [open])

  const inviteNote =
    uninvitedCount > 0
      ? `${uninvitedCount} invitation${uninvitedCount !== 1 ? "s" : ""} will be sent to voters who haven't been invited yet.`
      : "All voters have already been invited."

  const showProgress = !!progress
  const sendingDone = showProgress && !progress.sending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {showProgress
              ? progress.sending
                ? "Sending invitations…"
                : progress.stopped
                ? "Sending stopped"
                : "Invitations sent"
              : `Activate "${electionTitle}"?`}
          </DialogTitle>
        </DialogHeader>

        {showProgress ? (
          <div className="py-2">
            <InvitationProgress status={progress} />
          </div>
        ) : (
          <div className="py-2 space-y-3">
            <p className="text-sm text-zinc-600">
              Voting will open immediately.{" "}{inviteNote}
            </p>
            <div
              className="rounded-[10px] px-3.5 py-3 text-[13px] space-y-3"
              style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
            >
              <div>
                <p className="font-semibold text-vh-ink mb-1">At activation:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-vh-ink-soft">
                  <li>The Opens date locks.</li>
                  <li>The Closes date can be <strong>extended</strong> later, but not moved earlier.</li>
                  <li>You can still return to Draft (cancel activation) — but only until the first vote is cast.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-vh-ink mb-1">Once the first vote arrives:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-vh-ink-soft">
                  <li>The ballot (questions and options) locks.</li>
                  <li>Title, description, and email/reminder content lock.</li>
                  <li>Edits still allowed: extend the Closes date, close early, auto-send results.</li>
                  <li>To restart, you&apos;ll need <strong>Discard &amp; Reopen</strong>, which clears submitted votes.</li>
                </ul>
              </div>
            </div>
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
        )}

        <DialogFooter>
          {showProgress ? (
            <Button onClick={() => onOpenChange(false)} disabled={!sendingDone && false}>
              {progress.sending ? "Close" : "Done"}
            </Button>
          ) : (
            <>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={onConfirm} disabled={!checked || confirming}>
                {confirming ? "Activating…" : "Activate now"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
