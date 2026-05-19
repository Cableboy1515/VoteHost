"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  html: string
}

export default function EmailPreviewDialog({ open, onOpenChange, html }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Email preview</DialogTitle>
          <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>
            Approximate — clients may vary
          </p>
        </DialogHeader>
        <iframe
          srcDoc={html}
          className="w-full rounded-[10px]"
          style={{ height: "70vh", border: "1px solid var(--vh-line)" }}
          sandbox=""
          title="Email preview"
        />
      </DialogContent>
    </Dialog>
  )
}
