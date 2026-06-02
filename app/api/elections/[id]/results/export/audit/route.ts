export const runtime = "nodejs"

import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { exportFilename } from "@/lib/exportData"
import { getResultsForElection } from "@/lib/results"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params

  const election = await db.election.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      tallyHash: true,
      tallyHashSetAt: true,
      closedAt: true,
      endsAt: true,
      createdAt: true,
      quorumType: true,
      quorumValue: true,
    },
  })

  if (!election || election.status !== "COMPLETED") {
    return new Response("Not found or election not completed", { status: 404 })
  }

  const [questions, votes, receipts, voterStats, electionResults] = await Promise.all([
    db.question.findMany({
      where: { electionId: id },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    db.vote.findMany({
      where: { electionId: id },
      orderBy: [{ questionId: "asc" }],
    }),
    db.ballotReceipt.findMany({
      where: { electionId: id },
      select: { receiptCode: true, ballotHash: true },
      orderBy: { createdAt: "asc" },
    }),
    db.voter.aggregate({ where: { electionId: id }, _count: { id: true } }),
    getResultsForElection(id),
  ])

  const totalVoters = voterStats._count.id
  const votedCount = await db.voter.count({ where: { electionId: id, hasVoted: true } })
  let quorumRequired: number | null = null
  let quorumMet: boolean | null = null
  if (election.quorumType === "PERCENT" && election.quorumValue !== null && totalVoters > 0) {
    quorumRequired = Math.ceil(totalVoters * election.quorumValue / 100)
    quorumMet = votedCount >= quorumRequired
  } else if (election.quorumType === "COUNT" && election.quorumValue !== null) {
    quorumRequired = election.quorumValue
    quorumMet = votedCount >= quorumRequired
  }

  // Build human-readable tally results (option text instead of IDs) for auditors who
  // want to verify the algorithm output without re-running it from raw votes.
  // Note: tallyHash covers raw votes only — not this derived section.
  const tallyResults = electionResults.questions.map((q) => {
    if (q.type === "RANKED_CHOICE") {
      const rcv = (q as unknown as { rcvResult: {
        kind: string
        winner?: string | null
        winners?: string[]
        isTie?: boolean
        tiedOptions?: string[]
        quota?: number
        rounds?: Array<{
          round: number
          counts: Record<string, number>
          totalActive?: number
          quota?: number
          elected?: string[]
          eliminated?: string[]
        }>
      } | null }).rcvResult
      const optionLabel = (id: string) =>
        q.options.find((o) => (o as unknown as { optionId: string }).optionId === id)?.optionText ?? id
      return {
        questionId: q.questionId,
        questionText: q.questionText,
        type: "RANKED_CHOICE",
        method: rcv?.kind === "stv" ? "STV" : "IRV",
        seats: (q as unknown as { seats?: number }).seats ?? 1,
        ...( rcv?.kind === "irv" ? {
          winner: rcv.winner ? optionLabel(rcv.winner) : null,
          isTie: rcv.isTie ?? false,
          tiedOptions: (rcv.tiedOptions ?? []).map(optionLabel),
          rounds: (rcv.rounds ?? []).map((r) => ({
            round: r.round,
            totalActive: r.totalActive,
            counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [optionLabel(id), c])),
            eliminated: (r.eliminated ?? []).map(optionLabel),
          })),
        } : rcv?.kind === "stv" ? {
          winners: (rcv.winners ?? []).map(optionLabel),
          quota: rcv.quota,
          rounds: (rcv.rounds ?? []).map((r) => ({
            round: r.round,
            quota: r.quota,
            counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [optionLabel(id), c])),
            elected: (r.elected ?? []).map(optionLabel),
            eliminated: (r.eliminated ?? []).map(optionLabel),
          })),
        } : { winner: null, rounds: [] }),
      }
    }
    if (q.type === "COMMENT") {
      return {
        questionId: q.questionId,
        questionText: q.questionText,
        type: "COMMENT",
        responseCount: (q as unknown as { writeIns: unknown[] }).writeIns?.length ?? 0,
      }
    }
    // SINGLE_CHOICE / MULTIPLE_CHOICE
    const opts = (q as unknown as { options: Array<{ optionText: string; count: number }> }).options ?? []
    const topCount = Math.max(0, ...opts.map((o) => o.count))
    return {
      questionId: q.questionId,
      questionText: q.questionText,
      type: q.type,
      options: opts.map((o) => ({ option: o.optionText, count: o.count, winner: o.count === topCount && topCount > 0 })),
    }
  })

  const payload = {
    electionId: election.id,
    electionTitle: election.title,
    tallyHash: election.tallyHash ? `sha256:${election.tallyHash}` : null,
    tallyHashSetAt: election.tallyHashSetAt?.toISOString() ?? null,
    hashAlgorithm: "SHA-256 of canonical JSON (votes sorted by questionId ASC, optionId ASC, rank ASC)",
    quorum: election.quorumType !== "NONE"
      ? { type: election.quorumType, value: election.quorumValue, required: quorumRequired, met: quorumMet, voted: votedCount, total: totalVoters }
      : null,
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      seats: q.seats,
      options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
    })),
    votes: votes.map((v) => ({
      ballotId: v.ballotId,
      questionId: v.questionId,
      optionId: v.optionId,
      rank: v.rank,
      writeInText: v.writeInText,
      weight: v.weight,
    })),
    ballotReceipts: receipts,
    // Computed tally — verify by re-running the algorithm against the raw votes above.
    // Counts use option text for readability; IDs are in the questions[] section above.
    tallyResults,
  }

  const json = JSON.stringify(payload, null, 2)
  const slug = exportFilename(
    { ...election, closedAt: election.closedAt, endsAt: election.endsAt, createdAt: election.createdAt } as Parameters<typeof exportFilename>[0],
    "json"
  ).replace(".json", "-audit.json")

  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}"`,
    },
  })
}
