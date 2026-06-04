export const runtime = "nodejs"

/**
 * Cast Vote Record (CVR) export — one row per anonymized ballot.
 *
 * Ranked questions expand into rank-position columns (Q{n} Rank 1, Q{n} Rank 2, …) so that
 * an auditor can reconstruct every ballot's full preference order and independently re-run
 * IRV/STV to verify the published elimination rounds. This is the conventional artifact used
 * in real-world RCV audits (e.g. San Francisco, NYC, Maine).
 *
 * Ballots are anonymous — Vote rows carry no voterId. The BallotId column allows joining
 * back to the votes[] array in audit.json; it does not identify any voter.
 * Comment questions are omitted (free-text, not a tally candidate, and raises fingerprinting
 * risk if response sets are small). Their text is available in audit.json.
 *
 * Requires VIEWER role and COMPLETED election.
 */

import Papa from "papaparse"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { exportFilename } from "@/lib/exportData"
import { getDisplayTimeZone } from "@/lib/timezone"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params
  const tz = await getDisplayTimeZone()

  const election = await db.election.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      tallyHash: true,
      closedAt: true,
      endsAt: true,
      createdAt: true,
    },
  })

  if (!election || election.status !== "COMPLETED") {
    return new Response("Not found or election not completed", { status: 404 })
  }

  const [questions, votes] = await Promise.all([
    db.question.findMany({
      where: { electionId: id },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    db.vote.findMany({ where: { electionId: id } }),
  ])

  // option id → display text
  const optionTextById = new Map<string, string>()
  for (const q of questions) {
    for (const o of q.options) optionTextById.set(o.id, o.text)
  }

  // per ranked question: highest rank observed across all ballots → column count
  const maxRankByQId = new Map<string, number>()
  for (const v of votes) {
    if (v.rank !== null) {
      maxRankByQId.set(v.questionId, Math.max(maxRankByQId.get(v.questionId) ?? 0, v.rank))
    }
  }

  // Question descriptors used for both column definitions and the legend comment
  type QDesc =
    | { kind: "single" | "multiple"; qLabel: string; qId: string; text: string; type: string }
    | { kind: "ranked"; qLabel: string; qId: string; text: string; type: string; maxRank: number }
    | { kind: "comment"; qLabel: string; qId: string; text: string; type: string }

  const qDescs: QDesc[] = questions.map((q) => {
    const qLabel = `Q${q.order + 1}`
    if (q.type === "RANKED_CHOICE")
      return { kind: "ranked", qLabel, qId: q.id, text: q.text, type: q.type, maxRank: maxRankByQId.get(q.id) ?? 1 }
    if (q.type === "COMMENT")
      return { kind: "comment", qLabel, qId: q.id, text: q.text, type: q.type }
    if (q.type === "MULTIPLE_CHOICE")
      return { kind: "multiple", qLabel, qId: q.id, text: q.text, type: q.type }
    return { kind: "single", qLabel, qId: q.id, text: q.text, type: q.type }
  })

  // Build ordered column list
  const columns: string[] = ["BallotId"]
  for (const d of qDescs) {
    if (d.kind === "comment") continue
    if (d.kind === "ranked") {
      for (let r = 1; r <= d.maxRank; r++) columns.push(`${d.qLabel} Rank ${r}`)
    } else {
      columns.push(d.qLabel)
    }
  }

  // Group vote rows by ballotId → Map<questionId, Vote[]>
  const ballotMap = new Map<string, Map<string, typeof votes[number][]>>()
  for (const v of votes) {
    if (!v.ballotId) continue
    if (!ballotMap.has(v.ballotId)) ballotMap.set(v.ballotId, new Map())
    const qMap = ballotMap.get(v.ballotId)!
    if (!qMap.has(v.questionId)) qMap.set(v.questionId, [])
    qMap.get(v.questionId)!.push(v)
  }

  // Sort by ballotId (cuid — lexicographic order is not casting order, preserves anonymity)
  const sortedBallotIds = [...ballotMap.keys()].sort()

  // Build one row per ballot
  const rows: Record<string, string>[] = []
  for (const ballotId of sortedBallotIds) {
    const qMap = ballotMap.get(ballotId)!
    const row: Record<string, string> = { BallotId: ballotId }

    for (const d of qDescs) {
      if (d.kind === "comment") continue
      const qVotes = qMap.get(d.qId) ?? []

      if (d.kind === "ranked") {
        const byRank = new Map<number, string>()
        for (const v of qVotes) {
          if (v.rank !== null) {
            byRank.set(v.rank, (v.optionId ? optionTextById.get(v.optionId) : null) ?? v.writeInText ?? "")
          }
        }
        for (let r = 1; r <= d.maxRank; r++) {
          row[`${d.qLabel} Rank ${r}`] = byRank.get(r) ?? ""
        }
      } else if (d.kind === "multiple") {
        const texts = qVotes
          .map((v) => (v.optionId ? optionTextById.get(v.optionId) : null) ?? v.writeInText ?? "")
          .filter(Boolean)
          .sort()
        row[d.qLabel] = texts.join(" | ")
      } else {
        // single
        const v = qVotes[0]
        row[d.qLabel] = v ? ((v.optionId ? optionTextById.get(v.optionId) : null) ?? v.writeInText ?? "") : ""
      }
    }

    rows.push(row)
  }

  // Comment header — human-readable metadata and question legend
  const commentLines = [
    `# Cast Vote Record (CVR) — ${election.title}`,
    `# Tally Hash: ${election.tallyHash ? `sha256:${election.tallyHash}` : "(not set)"}`,
    `# Ballots: ${rows.length} (one row per anonymized ballot, sorted by BallotId)`,
    `# Note: BallotId sort order does NOT reflect ballot-casting sequence (anonymized).`,
    `# Note: Write-in values are raw/un-merged. See normalizationManifest in audit.json.`,
    `# Note: COMMENT questions are omitted; free-text responses are in audit.json.`,
    `#`,
    `# Question legend:`,
    ...qDescs.map((d) =>
      `#   ${d.qLabel} [${d.type}]: ${d.kind === "comment" ? "(omitted) " : ""}${d.text}`
    ),
    `#`,
  ]

  const csvBody = Papa.unparse(rows, { columns, header: true })
  const csv = commentLines.join("\n") + "\n" + csvBody

  const baseFilename = exportFilename(
    election as Parameters<typeof exportFilename>[0],
    "csv",
    tz,
  )
  const filename = baseFilename.replace(".csv", "-cvr.csv")

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
