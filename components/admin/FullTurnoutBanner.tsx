import CloseElectionEarlyButton from "@/components/admin/CloseElectionEarlyButton"
import { formatDateOnlyInTz, getDisplayTimeZone } from "@/lib/timezone"
import { electionHasWriteIns } from "@/lib/writeIn"

interface Props {
  electionId: string
  electionTitle: string
  votedCount: number
  invitedCount: number
  status: string
  endsAt: string | null
}

export default async function FullTurnoutBanner({
  electionId,
  electionTitle,
  votedCount,
  invitedCount,
  status,
  endsAt,
}: Props) {
  if (status !== "ACTIVE" || invitedCount === 0 || votedCount < invitedCount) return null

  const [tz, hasWriteIns] = await Promise.all([
    getDisplayTimeZone(),
    electionHasWriteIns(electionId),
  ])
  const closeNote = endsAt
    ? `You can close it now, or let it run until ${formatDateOnlyInTz(endsAt, tz)}.`
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
        <CloseElectionEarlyButton id={electionId} title={electionTitle} hasWriteIns={hasWriteIns} />
      </div>
    </div>
  )
}
