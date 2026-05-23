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

export default function CloseElectionEarlyButton({
  id,
  title,
  variant = "neutral",
}: {
  id: string
  title: string
  variant?: "neutral" | "danger"
}) {
  const router = useRouter()
  const [stage, setStage] = useState<"closed" | "warn" | "confirm">("closed")
  const [checked, setChecked] = useState(false)
  const [closing, setClosing] = useState(false)

  function openWarn() { setStage("warn") }
  function goConfirm() { setChecked(false); setStage("confirm") }
  function closeAll() { setStage("closed"); setChecked(false) }

  async function handleClose() {
    setClosing(true)
    await fetch(`/api/elections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "COMPLETED" }),
    })
    setClosing(false)
    closeAll()
    router.refresh()
  }

  const isDanger = variant === "danger"
  const restingStyle = isDanger
    ? { color: "var(--vh-danger)", background: "transparent", border: "1px solid var(--vh-danger)" }
    : { color: "var(--vh-ink-soft)", background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }
  const hoverBg = isDanger ? "var(--vh-danger-soft, #fef2f2)" : "var(--vh-surface-3)"
  const hoverColor = isDanger ? "var(--vh-danger)" : "var(--vh-ink)"

  return (
    <>
      <button
        type="button"
        onClick={openWarn}
        className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium transition-colors"
        style={restingStyle}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.background = hoverBg
          el.style.color = hoverColor
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement
          el.style.background = restingStyle.background
          el.style.color = restingStyle.color
        }}
      >
        Close election now
      </button>

      {/* Stage 1 — neutral warning */}
      <Dialog open={stage === "warn"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Close &ldquo;{title}&rdquo; now?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 py-2">
            Closing immediately ends this election. No more voters can be added or invited, and no further votes will be accepted.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={goConfirm}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage 2 — forceful confirmation with checkbox */}
      <Dialog open={stage === "confirm"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle style={{ color: "var(--vh-danger)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Are you absolutely sure?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
              <li>No more voters can be <strong>added or invited</strong>.</li>
              <li>No further <strong>votes</strong> will be accepted.</li>
              <li>This election will move to <strong>Completed</strong> status.</li>
              <li>Final results will be sent to staff immediately.</li>
            </ul>
            <label className="flex items-start gap-2.5 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-zinc-600">
                I understand this election will be finalized and cannot be re-opened — to run another vote, create a new election.
              </span>
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={!checked || closing}
            >
              {closing ? "Closing…" : "Yes, close election now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
