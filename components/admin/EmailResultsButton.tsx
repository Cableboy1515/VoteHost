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

interface Props {
  electionId: string
  status: string
  resultsEmailSentAt: string | null
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function EmailResultsButton({ electionId, status, resultsEmailSentAt: initialSentAt }: Props) {
  const disabled = status === "DRAFT" || status === "ACTIVE"
  const [sentAt, setSentAt] = useState(initialSentAt)
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null)

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  async function doSend(force = false) {
    setSending(true)
    try {
      const res = await fetch(`/api/elections/${electionId}/results/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(force ? { force: true } : {}),
      })
      const data = await res.json()
      if (res.ok) {
        setSentAt(new Date().toISOString())
        showToast("success", `Results emailed to ${data.sent} voter${data.sent !== 1 ? "s" : ""}${data.failed ? ` (${data.failed} failed)` : ""}.`)
      } else if (data.error === "alreadySent") {
        setConfirmOpen(true)
      } else {
        showToast("error", data.error ?? "Send failed. Check email settings.")
      }
    } finally {
      setSending(false)
    }
  }

  const tooltipTitle = disabled ? "Available after the election closes" : undefined

  return (
    <>
      <div className="flex items-start gap-2">
        <div title={tooltipTitle} className="flex flex-col items-end">
          <button
            disabled={disabled || sending}
            onClick={() => sentAt ? setConfirmOpen(true) : doSend(false)}
            className="px-3.5 py-2 rounded-[10px] text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              border: "1px solid transparent",
              background: sentAt ? "var(--vh-surface)" : "var(--vh-accent)",
              color: sentAt ? "var(--vh-ink-soft)" : "#ffffff",
              ...(sentAt ? { borderColor: "var(--vh-line-strong)" } : {}),
            }}
          >
            {sending ? "Sending…" : sentAt ? "Resend results email" : "Email results to voters"}
          </button>
          {sentAt && (
            <span className="text-[11.5px] mt-0.5" style={{ color: "var(--vh-muted)" }}>
              Sent {relativeDate(sentAt)}
            </span>
          )}
        </div>

        <TestResultsEmailButton electionId={electionId} disabled={disabled} />
      </div>

      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-[12px] text-[13.5px] font-medium"
          style={{
            background: toast.type === "success" ? "var(--vh-ink)" : "var(--vh-danger)",
            color: "#ffffff",
            boxShadow: "var(--vh-shadow-lg)",
            maxWidth: 340,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Resend confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Resend results email?</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm" style={{ color: "var(--vh-muted)", lineHeight: 1.6 }}>
              Results were already emailed{sentAt ? ` ${relativeDate(sentAt)}` : ""}. Sending again will reach all invited voters a second time.
            </p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <button
              onClick={async () => { setConfirmOpen(false); await doSend(true) }}
              className="px-4 py-2 rounded-[10px] text-[13.5px] font-medium"
              style={{ background: "var(--vh-accent)", color: "#ffffff" }}
            >
              Send again
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function TestResultsEmailButton({ electionId, disabled }: { electionId: string; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState("")
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<"sent" | "error" | null>(null)

  function handleOpenChange(next: boolean) {
    if (next) { setTo(""); setResult(null) }
    setOpen(next)
  }

  async function handleSend() {
    setSending(true)
    setResult(null)
    const res = await fetch(`/api/elections/${electionId}/results/email/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    })
    setSending(false)
    setResult(res.ok ? "sent" : "error")
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={
        <Button
          variant="outline"
          className="h-auto px-3.5 py-2 text-[13px] rounded-[10px]"
          disabled={disabled}
          style={{ background: "var(--vh-surface)", borderColor: "var(--vh-line-strong)", color: "var(--vh-ink-soft)" }}
          onMouseEnter={disabled ? undefined : (e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink)" }}
          onMouseLeave={disabled ? undefined : (e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-ink-soft)" }}
        />
      }>
        Preview email
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Preview results email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm" style={{ color: "var(--vh-muted)" }}>
            Sends a preview of the results email to any address — no voters are notified.
          </p>
          <div className="space-y-1">
            <Label htmlFor="resultsTestTo">Recipient email</Label>
            <Input
              id="resultsTestTo"
              type="email"
              placeholder="you@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {result === "sent" && <p className="text-sm" style={{ color: "var(--vh-success)" }}>Preview sent — check your inbox.</p>}
          {result === "error" && <p className="text-sm" style={{ color: "var(--vh-danger)" }}>Failed to send. Check email settings.</p>}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          <Button onClick={handleSend} disabled={sending || !to}>
            {sending ? "Sending…" : "Send preview"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
