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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const triggerStyle: React.CSSProperties = {
  color: "var(--vh-ink-soft)",
  background: "var(--vh-surface-2)",
  border: "1px solid var(--vh-line-strong)",
}

export default function ReopenElectionButton({ id }: { id: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [targetStatus, setTargetStatus] = useState<"ACTIVE" | "DRAFT">("ACTIVE")
  const [endsAt, setEndsAt] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleReopen() {
    setSaving(true)
    await fetch(`/api/elections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: targetStatus,
        endsAt: targetStatus === "ACTIVE" && endsAt ? new Date(endsAt).toISOString() : null,
      }),
    })
    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      setTargetStatus("ACTIVE")
      setEndsAt("")
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors"
            style={triggerStyle}
          />
        }
      >
        Reopen
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Reopen Election</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Reopen as</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="targetStatus"
                  value="ACTIVE"
                  checked={targetStatus === "ACTIVE"}
                  onChange={() => setTargetStatus("ACTIVE")}
                />
                Active — voting opens immediately
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="targetStatus"
                  value="DRAFT"
                  checked={targetStatus === "DRAFT"}
                  onChange={() => setTargetStatus("DRAFT")}
                />
                Draft — edit ballot or voters before reopening
              </label>
            </div>
          </div>
          {targetStatus === "ACTIVE" && (
            <div className="space-y-1">
              <Label htmlFor="newEndsAt">New end date (optional)</Label>
              <Input
                id="newEndsAt"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              <p className="text-xs text-zinc-500">Leave blank to run until manually closed.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleReopen} disabled={saving}>
            {saving ? "Reopening…" : "Reopen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
