import { db } from "@/lib/db"
import { computeTallyHash } from "@/lib/verification"
import { sendElectionResultsEmail } from "@/lib/sendElectionResultsEmail"
import { recordActivity } from "@/lib/recordActivity"

export async function autoCompleteElections(): Promise<string[]> {
  const candidates = await db.election.findMany({
    where: { status: "ACTIVE", endsAt: { lt: new Date() } },
    select: { id: true, title: true, autoSendResults: true, resultsEmailSentAt: true },
  })
  if (candidates.length === 0) return []

  const completed: string[] = []

  for (const candidate of candidates) {
    const { id, title } = candidate
    const votes = await db.vote.findMany({ where: { electionId: id } })
    const hash = computeTallyHash(votes)

    await db.election.update({
      where: { id },
      data: { status: "COMPLETED", tallyHash: hash, tallyHashSetAt: new Date() },
    })

    await recordActivity({
      system: true,
      action: "election.auto_complete",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: title,
      metadata: { voteCount: votes.length, tallyHash: hash },
    })

    if (candidate.autoSendResults && !candidate.resultsEmailSentAt) {
      sendElectionResultsEmail(id)
        .then(({ sentCount, failedCount }) =>
          recordActivity({
            system: true,
            action: "election.results_email_auto_sent",
            electionId: id,
            targetType: "election",
            targetId: id,
            targetLabel: title,
            metadata: { sentCount, failedCount },
          })
        )
        .catch((err) => console.error(`[autoCompleteElections] results email failed for ${id}:`, err))
    }

    completed.push(id)
  }

  return completed
}
