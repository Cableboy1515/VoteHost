"use client"

import { useState } from "react"
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

export default function ElectionTestEmailButton({ electionId }: { electionId: string }) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<"sent" | "error" | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) {
      setTo("")
      setResult(null)
    }
    setOpen(next)
  }

  async function handleSend() {
    setSending(true)
    setResult(null)
    const res = await fetch(`/api/elections/${electionId}/invite/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    })
    setSending(false)
    setResult(res.ok ? "sent" : "error")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="self-start px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{
              border: "1px solid var(--vh-line-strong)",
              background: "var(--vh-surface)",
              color: "var(--vh-ink-soft)",
            }}
          />
        }
      >
        Send test email
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Send test email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-zinc-500">
            Sends a preview of this election&apos;s invitation email with placeholder voter data.
          </p>
          <div className="space-y-1">
            <Label htmlFor="testTo">Recipient email</Label>
            <Input
              id="testTo"
              type="email"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {result === "sent" && (
            <p className="text-sm text-emerald-600">Test email sent — check your inbox.</p>
          )}
          {result === "error" && (
            <p className="text-sm text-red-500">Failed to send. Check your email settings.</p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          <Button onClick={handleSend} disabled={sending || !to}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
