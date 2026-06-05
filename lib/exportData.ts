import { db } from "./db"
import { getResultsForElection } from "./results"
import { formatDateSlugInTz } from "./timezone"
import type { Election } from "./generated/prisma/client"

export type EnrichedOption = {
  optionText: string
  count: number
  pct: number
  winner: boolean
}

export type EnrichedRcvOption = {
  optionId: string
  optionText: string
  firstChoiceCount: number
  pct: number
  winner: boolean
  rankCounts: Record<number, number>
}

export type EnrichedQuestion =
  | { type: "COMMENT"; questionText: string; writeIns: string[] }
  | { type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE"; questionText: string; options: EnrichedOption[]; isTie: boolean }
  | { type: "RANKED_CHOICE"; questionText: string; options: EnrichedRcvOption[]; maxRank: number; isTie: boolean; rcvKind: "irv" | "stv" | null; rcvRoundsCount: number }

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
  quorumType: string
  quorumValue: number | null
  quorumRequired: number | null
  quorumMet: boolean | null
  questions: EnrichedQuestion[]
  voters: VoterRow[]
}

/**
 * Neutralize leading spreadsheet formula triggers in a string cell value.
 * Prefixes cells whose value starts with = + - @ TAB or CR with an apostrophe
 * so Excel, Google Sheets, and LibreOffice treat the cell as text rather than
 * evaluating it as a formula. Applies only to voter/user-supplied free text.
 * (CWE-1236 / CSV Injection)
 */
export function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function slugifyTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "election"
}

export function exportFilename(election: Election, ext: string, tz = "UTC"): string {
  const slug = slugifyTitle(election.title)
  const date = formatDateSlugInTz(election.closedAt ?? election.endsAt ?? election.createdAt, tz)
  return `${slug}-results-${date}.${ext}`
}

export async function loadExportData(electionId: string): Promise<ExportData | null> {
  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election || election.status !== "COMPLETED") return null

  const raw = await getResultsForElection(electionId)

  const turnoutPct = raw.totalVoters > 0 ? Math.round((raw.votedCount / raw.totalVoters) * 100) : 0

  const questions: EnrichedQuestion[] = raw.questions.map((q) => {
    if (q.type === "COMMENT") {
      return {
        type: "COMMENT" as const,
        questionText: q.questionText,
        writeIns: (q as { writeIns?: string[] }).writeIns ?? [],
      }
    }

    if (q.type === "RANKED_CHOICE") {
      const rcvOptions = (q as unknown as { options: EnrichedRcvOption[] }).options
      const rcvResult = (q as unknown as { rcvResult?: { kind: string; winner?: string | null; winners?: string[]; isTie?: boolean; tiedOptions?: string[]; rounds?: unknown[] } }).rcvResult
      const sorted = [...rcvOptions].sort((a, b) => b.firstChoiceCount - a.firstChoiceCount)
      const total = sorted.reduce((sum, o) => sum + o.firstChoiceCount, 0)
      const maxRank = sorted.reduce((max, o) => {
        const ranks = Object.keys(o.rankCounts).map(Number)
        return ranks.length > 0 ? Math.max(max, ...ranks) : max
      }, 0)

      // Use IRV/STV winner(s) if available; fall back to first-choice leader
      let winnerIds: Set<string>
      let isTie: boolean
      if (rcvResult?.kind === "irv") {
        isTie = rcvResult.isTie ?? false
        winnerIds = rcvResult.winner ? new Set([rcvResult.winner]) : new Set(rcvResult.tiedOptions ?? [])
      } else if (rcvResult?.kind === "stv") {
        isTie = false
        winnerIds = new Set(rcvResult.winners ?? [])
      } else {
        const topFCC = sorted[0]?.firstChoiceCount ?? 0
        isTie = topFCC > 0 && sorted.filter((o) => o.firstChoiceCount === topFCC).length > 1
        winnerIds = isTie
          ? new Set(sorted.filter((o) => o.firstChoiceCount === topFCC).map((o) => o.optionId))
          : topFCC > 0 ? new Set([sorted[0]!.optionId]) : new Set()
      }

      const rcvKind = rcvResult?.kind === "irv" || rcvResult?.kind === "stv" ? rcvResult.kind : null
      const rcvRoundsCount = rcvResult?.rounds?.length ?? 0

      return {
        type: "RANKED_CHOICE" as const,
        questionText: q.questionText,
        isTie,
        options: sorted.map((o) => ({
          optionId: o.optionId,
          optionText: o.optionText,
          firstChoiceCount: o.firstChoiceCount,
          pct: total > 0 ? Math.round((o.firstChoiceCount / total) * 100) : 0,
          winner: winnerIds.has(o.optionId),
          rankCounts: o.rankCounts,
        })),
        maxRank,
        rcvKind,
        rcvRoundsCount,
      }
    }

    const rawOptions = (q as { options: Array<{ optionText: string; count: number }> }).options
    const sorted = [...rawOptions].sort((a, b) => b.count - a.count)
    const total = sorted.reduce((sum, o) => sum + o.count, 0)
    const topCount = sorted[0]?.count ?? 0
    const isTie = topCount > 0 && sorted.filter((o) => o.count === topCount).length > 1
    return {
      type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
      questionText: q.questionText,
      isTie,
      options: sorted.map((o) => ({
        optionText: o.optionText,
        count: o.count,
        pct: total > 0 ? Math.round((o.count / total) * 100) : 0,
        winner: topCount > 0 && o.count === topCount,
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
    quorumType: raw.quorumType,
    quorumValue: raw.quorumValue,
    quorumRequired: raw.quorumRequired,
    quorumMet: raw.quorumMet,
    questions,
    voters,
  }
}
