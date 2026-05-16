import CloseElectionEarlyButton from "@/components/admin/CloseElectionEarlyButton"

interface Props {
  electionId: string
  electionTitle: string
  votedCount: number
  invitedCount: number
  status: string
  endsAt: string | null
}

export default function FullTurnoutBanner({
  electionId,
  electionTitle,
  votedCount,
  invitedCount,
  status,
  endsAt,
}: Props) {
  if (status !== "ACTIVE" || invitedCount === 0 || votedCount < invitedCount) return null

  const closeNote = endsAt
    ? `You can close it now, or let it run until ${new Date(endsAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}.`
    : `You can close it now, or wait until you close it manually.`

  return (
    <div
      className="flex items-start gap-3 rounded-[14px] px-[18px] py-3.5 mb-4"
      style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
    >
      <span className="text-base mt-0.5 flex-shrink-0">🗳</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
          <strong>All {invitedCount} invited voter{invitedCount !== 1 ? "s" : ""} have cast their ballots.</strong>{" "}
          {closeNote}
        </p>
      </div>
      <div className="flex-shrink-0 ml-2">
        <CloseElectionEarlyButton id={electionId} title={electionTitle} />
      </div>
    </div>
  )
}
