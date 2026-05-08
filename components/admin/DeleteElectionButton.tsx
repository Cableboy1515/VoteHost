"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export default function DeleteElectionButton({ id, title }: { id: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/elections/${id}`, { method: "DELETE" })
    setDeleting(false)
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="px-3 py-1.5 rounded-[10px] text-[13px] font-medium text-white transition-colors"
            style={{ background: "var(--vh-danger)", border: "1px solid var(--vh-danger)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "oklch(0.50 0.20 25)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-danger)" }}
          />
        }
      >
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{title}&rdquo;?</DialogTitle>
          <DialogDescription>
            All voters, ballot responses, and results will be permanently deleted. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
