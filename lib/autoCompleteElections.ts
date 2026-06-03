import { db } from "@/lib/db"
import { computeTallyHash } from "@/lib/verification"
import { sendElectionResultsEmail } from "@/lib/sendElectionResultsEmail"
import { recordActivity } from "@/lib/recordActivity"
import { electionHasWriteIns } from "@/lib/writeIn"
import { sendElectionCompletedStaffNotice, sendElectionPendingReviewStaffNotice } from "@/lib/email"
import { getStaffRecipients, getViewerPlusRecipients } from "@/lib/staffRecipients"

export async function autoCompleteElections(): Promise<string[]> {
  const candidates = await db.election.findMany({
    where: { status: "ACTIVE", endsAt: { lt: new Date() } },
    select: { id: true, title: true, autoSendResults: true, resultsEmailSentAt: true, reviewNoticeSentAt: true },
  })
  if (candidates.length === 0) return []

  const completed: string[] = []

  for (const candidate of candidates) {
    const { id, title } = candidate

    const hasWriteIns = await electionHasWriteIns(id)

    if (hasWriteIns) {
      // Route to PENDING_REVIEW — voting stops but tally is not sealed yet.
      // An admin must merge write-in variants and call Finalize before results
      // are published. The tally hash is computed at Finalize, not here.
      const now = new Date()
      const alreadyNotified = !!candidate.reviewNoticeSentAt
      await db.election.update({
        where: { id },
        data: {
          status: "PENDING_REVIEW",
          endsAt: now,
          ...(alreadyNotified ? {} : { reviewNoticeSentAt: now }),
        },
      })
      await recordActivity({
        system: true,
        action: "election.enter_review",
        electionId: id,
        targetType: "election",
        targetId: id,
        targetLabel: title,
      })

      // Notify staff that write-in review is required (guard against re-sends
      // if the cron overlaps or if the election was already moved to review).
      if (!alreadyNotified) {
        const [voters, recipients] = await Promise.all([
          db.voter.findMany({ where: { electionId: id }, select: { hasVoted: true } }),
          getStaffRecipients(),
        ])
        const totalVoters = voters.length
        const votedCount = voters.filter((v) => v.hasVoted).length
        sendElectionPendingReviewStaffNotice(
          { id, title },
          recipients,
          votedCount,
          totalVoters,
        ).catch((err) => console.error(`[autoCompleteElections] pending-review email failed for ${id}:`, err))
      }
    } else {
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

      // Note: the staff "Election closed" notice for auto-completed elections is
      // handled by the reminders sweep (completionEmailSentAt == null), which runs
      // with getViewerPlusRecipients. No inline send here to avoid a race.

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
    }

    completed.push(id)
  }

  return completed
}
