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

export default function DeleteElectionButton({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [stage, setStage] = useState<"closed" | "warn" | "confirm">("closed")
  const [checked, setChecked] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function openWarn() { setStage("warn") }
  function goConfirm() { setChecked(false); setStage("confirm") }
  function closeAll() { setStage("closed"); setChecked(false) }

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/elections/${id}`, { method: "DELETE" })
    setDeleting(false)
    closeAll()
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={openWarn}
        className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium text-white transition-colors"
        style={{ background: "var(--vh-danger)", border: "1px solid var(--vh-danger)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(0.50 0.20 25)" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-danger)" }}
      >
        Delete
      </button>

      {/* Stage 1 — neutral warning */}
      <Dialog open={stage === "warn"} onOpenChange={(o) => { if (!o) closeAll() }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{title}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 py-2">
            All voters, ballot responses, and results will be permanently deleted. This cannot be undone.
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
              <li>All <strong>voters</strong> will be PERMANENTLY DELETED.</li>
              <li>All <strong>ballot responses and results</strong> will be PERMANENTLY DELETED.</li>
              <li>The election &ldquo;{title}&rdquo; will be gone forever.</li>
            </ul>
            <label className="flex items-start gap-2.5 cursor-pointer mt-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span className="text-sm text-zinc-600">
                I understand this cannot be undone
              </span>
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!checked || deleting}
            >
              {deleting ? "Deleting…" : "Yes, delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
