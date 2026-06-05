import { db } from "@/lib/db"
import { sendBallotInvitation, type ResultsQuestion } from "@/lib/email"
import { getResultsForElection } from "@/lib/results"

export async function sendElectionResultsEmail(
  electionId: string
): Promise<{ sentCount: number; failedCount: number; skipped: "already-sent" | "no-voters" | null }> {
  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) throw new Error(`Election ${electionId} not found`)

  if (election.resultsEmailSentAt) {
    return { sentCount: 0, failedCount: 0, skipped: "already-sent" }
  }

  const raw = await getResultsForElection(electionId)

  const turnoutPct =
    raw.totalVoters > 0 ? Math.round((raw.votedCount / raw.totalVoters) * 100) : 0

  const questions: ResultsQuestion[] = raw.questions.flatMap((q) => {
    // COMMENT questions are omitted from the voter results email. The full grouped
    // responses are available in the admin dashboard and audit export.
    if (q.type === "COMMENT") return []

    const rawOptions = (
      q as { options?: Array<{ optionText: string; count?: number; firstChoiceCount?: number }> }
    ).options ?? []
    const getCount = (o: { count?: number; firstChoiceCount?: number }) =>
      q.type === "RANKED_CHOICE" ? (o.firstChoiceCount ?? 0) : (o.count ?? 0)

    const sorted = [...rawOptions].sort((a, b) => getCount(b) - getCount(a))
    const total = sorted.reduce((sum, o) => sum + getCount(o), 0)

    const options = sorted.map((o, i) => ({
      optionText: o.optionText,
      count: getCount(o),
      pct: total > 0 ? Math.round((getCount(o) / total) * 100) : 0,
      winner: i === 0 && getCount(o) > 0,
    }))

    return [{
      questionText: q.questionText,
      type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE",
      options,
    }]
  })

  const resultsPayload = { totalVoters: raw.totalVoters, votedCount: raw.votedCount, turnoutPct, questions }

  const voters = await db.voter.findMany({
    where: { electionId, invitedAt: { not: null } },
  })

  if (voters.length === 0) {
    await db.election.update({
      where: { id: electionId },
      data: { resultsEmailSentAt: new Date() },
    })
    return { sentCount: 0, failedCount: 0, skipped: "no-voters" }
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const resultsUrl = `${baseUrl}/elections/${electionId}/results`

  let sent = 0
  let failed = 0

  for (const voter of voters) {
    const { error } = await sendBallotInvitation(
      {
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: resultsUrl,
        emailSubject: election.emailSubject,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
        endsAt: election.endsAt?.toISOString(),
        results: resultsPayload,
      },
      "results"
    )
    if (error) { failed++; continue }
    sent++
  }

  await db.election.update({
    where: { id: electionId },
    data: { resultsEmailSentAt: new Date() },
  })

  return { sentCount: sent, failedCount: failed, skipped: null }
}
