import { db } from "./db"
import { computeTallyHash } from "./verification"
import { groupBallots, runIRV, runSTV } from "./tally/rankedChoice"
import type { Question, Option, Vote } from "./generated/prisma/client"

type QuestionWithOptions = Question & { options: Option[] }

export async function getResultsForElection(electionId: string) {
  const [election, questions, votes, voterStats] = await Promise.all([
    db.election.findUnique({ where: { id: electionId } }),
    db.question.findMany({
      where: { electionId },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    db.vote.findMany({ where: { electionId } }),
    db.voter.aggregate({
      where: { electionId },
      _count: { id: true },
    }),
  ])

  const votedCount = await db.voter.count({
    where: { electionId, hasVoted: true },
  })

  const questionResults = (questions as QuestionWithOptions[]).map((question) => {
    const questionVotes = (votes as Vote[]).filter((v) => v.questionId === question.id)

    if (question.type === "WRITE_IN") {
      return {
        questionId: question.id,
        questionText: question.text,
        type: question.type,
        writeIns: questionVotes.map((v) => v.writeInText).filter(Boolean),
      }
    }

    if (question.type === "RANKED_CHOICE") {
      const rankTotals = question.options.map((option) => {
        const rankCounts: Record<number, number> = {}
        questionVotes
          .filter((v) => v.optionId === option.id)
          .forEach((v) => {
            if (v.rank !== null) {
              rankCounts[v.rank] = (rankCounts[v.rank] ?? 0) + 1
            }
          })
        return {
          optionId: option.id,
          optionText: option.text,
          rankCounts,
          firstChoiceCount: rankCounts[1] ?? 0,
        }
      })

      const seats = question.seats ?? 1
      const allOptionIds = question.options.map((o) => o.id)
      const groupedBallots = groupBallots(
        questionVotes.map((v) => ({ ballotId: v.ballotId, optionId: v.optionId, rank: v.rank }))
      )

      const rcvResult =
        groupedBallots.length > 0
          ? seats > 1
            ? ({ kind: "stv" as const, ...runSTV(groupedBallots, allOptionIds, seats) })
            : ({ kind: "irv" as const, ...runIRV(groupedBallots, allOptionIds) })
          : null

      return {
        questionId: question.id,
        questionText: question.text,
        type: question.type,
        seats,
        options: rankTotals,
        rcvResult,
      }
    }

    const optionCounts = question.options.map((option) => ({
      optionId: option.id,
      optionText: option.text,
      count: questionVotes.filter((v) => v.optionId === option.id).length,
    }))

    return {
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      options: optionCounts,
    }
  })

  // Quorum computation
  const quorumType = election?.quorumType ?? "NONE"
  const quorumValue = election?.quorumValue ?? null
  const totalVoters = voterStats._count.id

  let quorumRequired: number | null = null
  let quorumMet: boolean | null = null

  if (quorumType === "PERCENT" && quorumValue !== null && totalVoters > 0) {
    quorumRequired = Math.ceil(totalVoters * quorumValue / 100)
    quorumMet = votedCount >= quorumRequired
  } else if (quorumType === "COUNT" && quorumValue !== null) {
    quorumRequired = quorumValue
    quorumMet = votedCount >= quorumRequired
  }

  let tallyHash = election?.tallyHash ?? null
  const tallyHashSetAt = election?.tallyHashSetAt ?? null

  // Lazily compute and persist if election is completed but hash is missing
  if (election?.status === "COMPLETED" && !tallyHash && votes.length > 0) {
    tallyHash = computeTallyHash(votes)
    db.election.update({
      where: { id: electionId },
      data: { tallyHash, tallyHashSetAt: new Date() },
    }).catch(() => {})
  }

  return {
    electionId,
    electionTitle: election?.title ?? "",
    totalVoters,
    votedCount,
    quorumType,
    quorumValue,
    quorumRequired,
    quorumMet,
    tallyHash,
    tallyHashSetAt,
    questions: questionResults,
  }
}

export type ElectionResults = Awaited<ReturnType<typeof getResultsForElection>>
