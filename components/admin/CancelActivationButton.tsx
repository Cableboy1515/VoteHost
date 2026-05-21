"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface Props {
  electionId: string
  electionTitle: string
}

export default function CancelActivationButton({ electionId, electionTitle }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<"closed" | "warn" | "confirm">("closed")
  const [titleConfirm, setTitleConfirm] = useState("")
  const [cancelling, setCancelling] = useState(false)

  function openWarn() { setStage("warn") }
  function goConfirm() { setTitleConfirm(""); setStage("confirm") }
  function closeAll() { setStage("closed"); setTitleConfirm("") }

  const titleMatch = titleConfirm === electionTitle
  const canSubmit = titleMatch && !cancelling

  async function handleCancel() {
    setCancelling(true)
    const res = await fetch(`/api/elections/${electionId}/cancel-activation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: titleConfirm }),
    })
    setCancelling(false)
    closeAll()
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      const notified = d.votersNotified as number | undefined
      const voterNote = notified ? `, ${notified} voter${notified !== 1 ? "s" : ""} notified` : ""
      toast.success(`Activation cancelled — election returned to Draft${voterNote}`)
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Failed to cancel activation")
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openWarn}
        className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-colors"
        style={{ color: "var(--vh-danger)", border: "1px solid var(--vh-danger)", background: "transparent" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-danger-soft, #fef2f2)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
      >
        Cancel Activation
      </button>

      {/* Stage 1 — warning */}
      <Dialog open={stage === "warn"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Cancel activation of &ldquo;{electionTitle}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 py-2">
            This will return the election to <strong>Draft</strong> status. Invitations have already been sent
            — those voters will receive a notice that voting has been postponed. You can re-activate once you
            are ready.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Keep active</DialogClose>
            <Button onClick={goConfirm}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage 2 — typed title confirmation */}
      <Dialog open={stage === "confirm"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--vh-danger)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Confirm cancellation
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
              <li>The election returns to <strong>Draft</strong> status.</li>
              <li>Auto-start is disabled — you must activate manually when ready.</li>
              <li>Invited voters will receive a <strong>voting postponed</strong> notice.</li>
            </ul>
            <div className="space-y-1">
              <Label htmlFor="cancelActivationTitleConfirm">
                Type the election title to confirm:{" "}
                <span className="font-mono text-xs bg-zinc-100 px-1 rounded">{electionTitle}</span>
              </Label>
              <Input
                id="cancelActivationTitleConfirm"
                value={titleConfirm}
                onChange={(e) => setTitleConfirm(e.target.value)}
                placeholder="Exact election title"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!canSubmit}
            >
              {cancelling ? "Cancelling…" : "Yes, cancel activation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
