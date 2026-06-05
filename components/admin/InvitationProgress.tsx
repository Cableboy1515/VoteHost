"use client"

export type ActivationStatus = {
  total: number
  invited: number
  failed: number
  sending: boolean
  stopped: boolean
  stopReason?: string
  lastError?: string
}

interface Props {
  status: ActivationStatus
}

export default function InvitationProgress({ status }: Props) {
  const { total, invited, failed, sending, stopped, stopReason } = status
  const done = invited + failed
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  let statusLine: React.ReactNode
  if (sending) {
    statusLine = (
      <span style={{ color: "var(--vh-ink-soft)" }}>
        Sent <strong>{invited}</strong> of <strong>{total}</strong>
        {failed > 0 && <span style={{ color: "var(--vh-warn)" }}> · {failed} failed</span>}
      </span>
    )
  } else if (stopped) {
    const reason =
      stopReason === "quota"
        ? "Email provider quota reached"
        : stopReason === "consecutive_failures"
        ? "Repeated send failures"
        : stopReason === "manual"
        ? "Stopped by user"
        : "Sending stopped"
    statusLine = (
      <span style={{ color: "var(--vh-warn)" }}>
        {reason} · Sent {invited} of {total}
        {failed > 0 && ` · ${failed} failed`}
      </span>
    )
  } else {
    statusLine = (
      <span style={{ color: "var(--vh-success)" }}>
        {invited === total
          ? `All ${total} invitation${total !== 1 ? "s" : ""} sent`
          : `Sent ${invited} of ${total}${failed > 0 ? ` · ${failed} failed` : ""}`}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, background: "var(--vh-line-strong)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: stopped ? "var(--vh-warn)" : sending ? "var(--vh-accent)" : "var(--vh-success)",
          }}
        />
      </div>
      <p className="text-[13px]">{statusLine}</p>
    </div>
  )
}
