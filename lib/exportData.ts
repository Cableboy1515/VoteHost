import { db } from "./db"
import { getResultsForElection } from "./results"
import type { Election } from "./generated/prisma/client"

export type EnrichedOption = {
  optionText: string
  count: number
  pct: number
  winner: boolean
}

export type EnrichedRcvOption = {
  optionText: string
  firstChoiceCount: number
  pct: number
  winner: boolean
  rankCounts: Record<number, number>
}

export type EnrichedQuestion =
  | { type: "WRITE_IN"; questionText: string; writeIns: string[] }
  | { type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE"; questionText: string; options: EnrichedOption[] }
  | { type: "RANKED_CHOICE"; questionText: string; options: EnrichedRcvOption[]; maxRank: number }

export type VoterRow = {
  name: string
  email: string
  invitedAt: Date | null
  hasVoted: boolean
  votedAt: Date | null
}

export type ExportData = {
  election: Election
  totalVoters: number
  votedCount: number
  turnoutPct: number
  tallyHash: string | null
  questions: EnrichedQuestion[]
  voters: VoterRow[]
}

export function slugifyTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "election"
}

export function exportFilename(election: Election, ext: string): string {
  const slug = slugifyTitle(election.title)
  const date = (election.closedAt ?? election.endsAt ?? election.createdAt).toISOString().slice(0, 10)
  return `${slug}-results-${date}.${ext}`
}

export async function loadExportData(electionId: string): Promise<ExportData | null> {
  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election || election.status !== "COMPLETED") return null

  const raw = await getResultsForElection(electionId)

  const turnoutPct = raw.totalVoters > 0 ? Math.round((raw.votedCount / raw.totalVoters) * 100) : 0

  const questions: EnrichedQuestion[] = raw.questions.map((q) => {
    if (q.type === "WRITE_IN") {
      return {
        type: "WRITE_IN" as const,
        questionText: q.questionText,
        writeIns: (q as { writeIns?: string[] }).writeIns ?? [],
      }
    }

    if (q.type === "RANKED_CHOICE") {
      const rcvOptions = (q as unknown as { options: EnrichedRcvOption[] }).options
      const sorted = [...rcvOptions].sort((a, b) => b.firstChoiceCount - a.firstChoiceCount)
      const total = sorted.reduce((sum, o) => sum + o.firstChoiceCount, 0)
      const maxRank = sorted.reduce((max, o) => {
        const ranks = Object.keys(o.rankCounts).map(Number)
        return ranks.length > 0 ? Math.max(max, ...ranks) : max
      }, 0)
      return {
        type: "RANKED_CHOICE" as const,
        questionText: q.questionText,
        options: sorted.map((o, i) => ({
          optionText: o.optionText,
          firstChoiceCount: o.firstChoiceCount,
          pct: total > 0 ? Math.round((o.firstChoiceCount / total) * 100) : 0,
          winner: i === 0 && o.firstChoiceCount > 0,
          rankCounts: o.rankCounts,
        })),
        maxRank,
      }
    }

    const rawOptions = (q as { options: Array<{ optionText: string; count: number }> }).options
    const sorted = [...rawOptions].sort((a, b) => b.count - a.count)
    const total = sorted.reduce((sum, o) => sum + o.count, 0)
    return {
      type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
      questionText: q.questionText,
      options: sorted.map((o, i) => ({
        optionText: o.optionText,
        count: o.count,
        pct: total > 0 ? Math.round((o.count / total) * 100) : 0,
        winner: i === 0 && o.count > 0,
      })),
    }
  })

  const voters = await db.voter.findMany({
    where: { electionId },
    select: { name: true, email: true, invitedAt: true, hasVoted: true, votedAt: true },
    orderBy: [{ hasVoted: "desc" }, { email: "asc" }],
  })

  return {
    election,
    totalVoters: raw.totalVoters,
    votedCount: raw.votedCount,
    turnoutPct,
    tallyHash: raw.tallyHash,
    questions,
    voters,
  }
}
