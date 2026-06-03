import { db } from "./db"
import { computeTallyHash } from "./verification"
import { groupBallots, runIRV, runSTV } from "./tally/rankedChoice"
import type { Question, Option, Vote } from "./generated/prisma/client"

type QuestionWithOptions = Question & { options: Option[] }

export async function getResultsForElection(electionId: string) {
  const [election, questions, votes, voterStats, votedVoterStats, writeInMergeRows] = await Promise.all([
    db.election.findUnique({ where: { id: electionId } }),
    db.question.findMany({
      where: { electionId },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    db.vote.findMany({ where: { electionId } }),
    db.voter.aggregate({ where: { electionId }, _count: { id: true }, _sum: { weight: true } }),
    db.voter.aggregate({ where: { electionId, hasVoted: true }, _count: { id: true }, _sum: { weight: true } }),
    // Write-in normalization overlay: raw text → canonical label per question.
    // Non-destructive — raw Vote.writeInText is never mutated; this is applied at tally time.
    db.writeInMerge.findMany({
      where: { electionId },
      select: { questionId: true, rawText: true, canonicalLabel: true },
    }),
  ])

  // Per-question merge map: questionId → Map<rawText, canonicalLabel>
  const mergeMapByQuestion = new Map<string, Map<string, string>>()
  for (const m of writeInMergeRows) {
    if (!mergeMapByQuestion.has(m.questionId)) mergeMapByQuestion.set(m.questionId, new Map())
    mergeMapByQuestion.get(m.questionId)!.set(m.rawText, m.canonicalLabel)
  }

  const weightingEnabled = election?.weightingEnabled ?? false
  const votedCount = votedVoterStats._count.id
  const totalWeight = voterStats._sum.weight ?? voterStats._count.id
  const votedWeight = votedVoterStats._sum.weight ?? votedCount

  const questionResults = (questions as QuestionWithOptions[]).map((question) => {
    const questionVotes = (votes as Vote[]).filter((v) => v.questionId === question.id)

    if (question.type === "COMMENT") {
      return {
        questionId: question.id,
        questionText: question.text,
        type: question.type,
        writeIns: questionVotes.map((v) => v.writeInText).filter(Boolean),
      }
    }

    if (question.type === "RANKED_CHOICE") {
      const mergeMap = mergeMapByQuestion.get(question.id) ?? new Map<string, string>()
      const optionTextToId = new Map(question.options.map((o) => [o.text, o.id]))

      // Tally rank counts for pre-listed options (option votes only).
      const rankTotals = question.options.map((option) => {
        const rankCounts: Record<number, number> = {}
        questionVotes
          .filter((v) => v.optionId === option.id)
          .forEach((v) => {
            if (v.rank !== null) rankCounts[v.rank] = (rankCounts[v.rank] ?? 0) + 1
          })
        return {
          optionId: option.id,
          optionText: option.text,
          rankCounts,
          firstChoiceCount: rankCounts[1] ?? 0,
          isWriteIn: false as const,
        }
      })

      // Apply write-in normalization overlay for ranked questions.
      // Write-ins that normalize to a real option's label are merged into that
      // option's tally; all others get a synthetic "writein:<label>" candidate id.
      const writeInVotes = questionVotes.filter((v) => v.optionId === null && v.writeInText)
      const synthCandidates = new Map<string, { text: string; rankCounts: Record<number, number> }>()

      for (const v of writeInVotes) {
        const normalized = mergeMap.get(v.writeInText!) ?? v.writeInText!
        const realId = optionTextToId.get(normalized)
        if (realId) {
          // Fold into the real option's rank counts.
          const ro = rankTotals.find((o) => o.optionId === realId)
          if (ro && v.rank !== null) {
            ro.rankCounts[v.rank] = (ro.rankCounts[v.rank] ?? 0) + 1
            if (v.rank === 1) ro.firstChoiceCount++
          }
        } else {
          const cid = `writein:${normalized}`
          if (!synthCandidates.has(cid)) synthCandidates.set(cid, { text: normalized, rankCounts: {} })
          const c = synthCandidates.get(cid)!
          if (v.rank !== null) c.rankCounts[v.rank] = (c.rankCounts[v.rank] ?? 0) + 1
        }
      }

      const synthTotals = [...synthCandidates.entries()].map(([cid, c]) => ({
        optionId: cid,
        optionText: c.text,
        rankCounts: c.rankCounts,
        firstChoiceCount: c.rankCounts[1] ?? 0,
        isWriteIn: true as const,
      }))

      const allTotals = [...rankTotals, ...synthTotals]
      const seats = question.seats ?? 1
      const allCandidateIds = allTotals.map((o) => o.optionId)

      // Map each vote row to a stable candidateId for groupBallots.
      const groupedBallots = groupBallots(
        questionVotes.map((v) => {
          let candidateId: string | null = v.optionId
          if (v.optionId === null && v.writeInText) {
            const normalized = mergeMap.get(v.writeInText) ?? v.writeInText
            candidateId = optionTextToId.get(normalized) ?? `writein:${normalized}`
          }
          return { ballotId: v.ballotId, candidateId, rank: v.rank }
        })
      )

      const rcvResult =
        groupedBallots.length > 0
          ? seats > 1
            ? ({ kind: "stv" as const, ...runSTV(groupedBallots, allCandidateIds, seats) })
            : ({ kind: "irv" as const, ...runIRV(groupedBallots, allCandidateIds) })
          : null

      return {
        questionId: question.id,
        questionText: question.text,
        type: question.type,
        seats,
        options: allTotals,
        rcvResult,
      }
    }

    // SINGLE_CHOICE and MULTIPLE_CHOICE — tally real options then bucket write-ins.
    const mergeMap = mergeMapByQuestion.get(question.id) ?? new Map<string, string>()
    const optionTextToId = new Map(question.options.map((o) => [o.text, o.id]))

    const optionCounts = question.options.map((option) => {
      const matching = questionVotes.filter((v) => v.optionId === option.id)
      return {
        optionId: option.id,
        optionText: option.text,
        count: weightingEnabled
          ? matching.reduce((sum, v) => sum + (v.weight ?? 1), 0)
          : matching.length,
        rawCount: matching.length,
        isWriteIn: false as boolean,
      }
    })

    // Bucket write-in votes (only possible when question.allowWriteIn is true).
    if (question.allowWriteIn) {
      const writeInVotes = questionVotes.filter((v) => v.optionId === null && v.writeInText)
      const synthBuckets = new Map<string, { text: string; count: number; rawCount: number }>()

      for (const v of writeInVotes) {
        const normalized = mergeMap.get(v.writeInText!) ?? v.writeInText!
        const realId = optionTextToId.get(normalized)
        if (realId) {
          // Merge into real option.
          const ro = optionCounts.find((o) => o.optionId === realId)
          if (ro) {
            ro.count += weightingEnabled ? (v.weight ?? 1) : 1
            ro.rawCount++
          }
        } else {
          const cid = `writein:${normalized}`
          if (!synthBuckets.has(cid)) synthBuckets.set(cid, { text: normalized, count: 0, rawCount: 0 })
          const b = synthBuckets.get(cid)!
          b.count += weightingEnabled ? (v.weight ?? 1) : 1
          b.rawCount++
        }
      }

      for (const [cid, b] of synthBuckets) {
        optionCounts.push({
          optionId: cid,
          optionText: b.text,
          count: b.count,
          rawCount: b.rawCount,
          isWriteIn: true as const,
        })
      }
    }

    return {
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      options: optionCounts,
    }
  })

  // Quorum computation — uses weight sums when weighting is enabled
  const quorumType = election?.quorumType ?? "NONE"
  const quorumValue = election?.quorumValue ?? null
  const totalVoters = voterStats._count.id

  // Participation denominator: weight sum when weighted, headcount otherwise
  const participationNumerator = weightingEnabled ? votedWeight : votedCount
  const participationDenominator = weightingEnabled ? totalWeight : totalVoters

  let quorumRequired: number | null = null
  let quorumMet: boolean | null = null

  if (quorumType === "PERCENT" && quorumValue !== null && participationDenominator > 0) {
    quorumRequired = Math.ceil(participationDenominator * quorumValue / 100)
    quorumMet = participationNumerator >= quorumRequired
  } else if (quorumType === "COUNT" && quorumValue !== null) {
    quorumRequired = quorumValue
    quorumMet = participationNumerator >= quorumRequired
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
    weightingEnabled,
    totalWeight,
    votedWeight,
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
