interface Props {
  firstVoteAt: string | null
  ballotResetAt: string | null
  ballotResetByEmail: string | null
  reopenedAt?: string | null
  reopenedByEmail?: string | null
  electionStatus: "DRAFT" | "ACTIVE" | "COMPLETED"
  onSettingsTab?: boolean
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return `${days} days ago`
}

export default function BallotLockBanner({ firstVoteAt, ballotResetAt, ballotResetByEmail, reopenedAt, reopenedByEmail, electionStatus, onSettingsTab }: Props) {
  if (electionStatus === "COMPLETED") return null
  if (firstVoteAt) {
    return (
      <div
        className="flex items-start gap-3 rounded-[14px] px-[18px] py-3.5 mb-4"
        style={{ background: "var(--vh-warn-soft)", border: "1px solid oklch(0.85 0.08 80)" }}
      >
        <span className="text-base mt-0.5 flex-shrink-0">🔒</span>
        <p className="text-[13.5px]" style={{ color: "oklch(0.4 0.12 65)" }}>
          <strong>Election locked</strong> — first vote cast {relativeTime(firstVoteAt)}.
          Ballot and settings cannot be edited (except the close date). To restart with a fresh ballot and settings, use{" "}
          <strong>Discard &amp; Reopen</strong>{" "}
          {onSettingsTab ? "at the bottom of this page" : "on the Settings tab"}.
        </p>
      </div>
    )
  }

  if (reopenedAt) {
    return (
      <div
        className="flex items-start gap-3 rounded-[14px] px-[18px] py-3.5 mb-4"
        style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
      >
        <span className="text-base mt-0.5 flex-shrink-0">↺</span>
        <p className="text-[13.5px]" style={{ color: "var(--vh-ink-soft)" }}>
          Election was reopened {relativeTime(reopenedAt)} by{" "}
          <strong>{reopenedByEmail ?? "a deleted user"}</strong>.
        </p>
      </div>
    )
  }

  if (ballotResetAt) {
    return (
      <div
        className="flex items-start gap-3 rounded-[14px] px-[18px] py-3.5 mb-4"
        style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
      >
        <span className="text-base mt-0.5 flex-shrink-0">↺</span>
        <p className="text-[13.5px]" style={{ color: "var(--vh-ink-soft)" }}>
          Ballot was reset {relativeTime(ballotResetAt)} by{" "}
          <strong>{ballotResetByEmail ?? "a deleted user"}</strong>. Voters were notified to recast their ballots.
        </p>
      </div>
    )
  }

  return null
}
