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
import { toast } from "sonner"

interface Props {
  electionId: string
  votedCount: number
}

export default function DiscardBallotButton({ electionId, votedCount }: Props) {
  const router = useRouter()
  const [stage, setStage] = useState<"closed" | "warn" | "confirm">("closed")
  const [checked, setChecked] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  function openWarn() { setStage("warn") }
  function goConfirm() { setChecked(false); setStage("confirm") }
  function closeAll() { setStage("closed"); setChecked(false) }

  async function handleDiscard() {
    setDiscarding(true)
    const res = await fetch(`/api/elections/${electionId}/reset-ballot`, { method: "POST" })
    setDiscarding(false)
    closeAll()
    if (res.ok) {
      toast.success("Ballot reset — voters notified to recast")
      router.refresh()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Failed to reset ballot")
    }
  }

  const n = votedCount

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
        Discard &amp; Reopen
      </button>

      {/* Stage 1 — neutral warning */}
      <Dialog open={stage === "warn"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard all votes and reopen ballot?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 py-2">
            This will permanently delete all <strong>{n} vote{n !== 1 ? "s" : ""}</strong> cast so far.
            The ballot structure will become editable again, and the {n} voter{n !== 1 ? "s" : ""} who already
            voted will receive an email asking them to recast their ballot.
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
            <p className="text-sm font-semibold" style={{ color: "var(--vh-danger)" }}>
              THIS CANNOT BE UNDONE.
            </p>
            <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
              <li><strong>{n} vote{n !== 1 ? "s" : ""}</strong> will be PERMANENTLY DELETED.</li>
              <li><strong>{n} voter{n !== 1 ? "s" : ""}</strong> will receive an email asking them to recast.</li>
              <li>The ballot will become editable again.</li>
            </ul>
            <label className="flex items-start gap-2.5 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-zinc-600">
                I understand and want to discard {n} vote{n !== 1 ? "s" : ""}
              </span>
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={handleDiscard}
              disabled={!checked || discarding}
            >
              {discarding ? "Discarding…" : `Yes, discard ${n} vote${n !== 1 ? "s" : ""} and reopen`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
