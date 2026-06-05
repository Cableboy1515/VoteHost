export const runtime = "nodejs"

/**
 * BLT ballot-data export for ranked-choice contests.
 *
 * BLT is the open interchange format for IRV/STV ballot data (Hill–Wichmann–Woodall, 1980s).
 * Compatible with OpaVote, OpenSTV, python-vote-core, and other open-source verifiers.
 * Format: one file per contest (one candidate list + one ballot section).
 *
 * Adaptive delivery:
 *   1 ranked contest  → single <contest>.blt file  (text/plain)
 *   2+ ranked contests → zip of one .blt per contest + README.txt (application/zip)
 *
 * Faithfulness: ballots are reconstructed using the same candidateId mapping as the
 * published tally (via getResultsForElection + groupBallots), so write-in merges are
 * applied and the BLT reproduces the exact published IRV/STV result.
 *
 * Requires VIEWER role and COMPLETED election.
 */

import { PassThrough } from "node:stream"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { getResultsForElection } from "@/lib/results"
import { groupBallots } from "@/lib/tally/rankedChoice"
import { slugifyTitle } from "@/lib/exportData"
import { getDisplayTimeZone, formatDateSlugInTz } from "@/lib/timezone"
import type { Vote } from "@/lib/generated/prisma/client"

// ─── BLT builder ─────────────────────────────────────────────────────────────

type RankedQResult = {
  questionId: string
  questionText: string
  seats: number
  options: Array<{ optionId: string; optionText: string }>
}

/**
 * Build a single BLT file string for one ranked-choice contest.
 * Candidate list order matches getResultsForElection's `options` array (which matches
 * the engine's enumeration order, including synthetic writein: candidates).
 * Every ballot line uses weight 1 (ranked tabulation is one-ballot-one-vote).
 */
function buildBlt(
  qResult: RankedQResult,
  qVotes: Vote[],
  mergeMap: Map<string, string>,
): string {
  const { questionText, seats, options } = qResult

  // 1-based candidate index map — keyed by the same candidateId the engine used
  const candIndex = new Map<string, number>()
  options.forEach((o, i) => candIndex.set(o.optionId, i + 1))

  // Map votes to the same candidateId shape as lib/results.ts:116-123
  const voteInputs = qVotes.map((v) => {
    let candidateId: string | null = v.optionId
    if (v.optionId === null && v.writeInText) {
      const normalized = mergeMap.get(v.writeInText) ?? v.writeInText
      candidateId = `writein:${normalized}`
    }
    return { ballotId: v.ballotId, candidateId, rank: v.rank }
  })

  const ballots = groupBallots(voteInputs) // string[][] — one inner array per ballot, candidateIds in rank order

  const lines: string[] = []
  lines.push(`${options.length} ${seats}`)

  for (const ballot of ballots) {
    if (ballot.length === 0) continue
    // Map candidateIds → 1-based indices; skip any id not in the index (shouldn't happen)
    const indices = ballot
      .map((cid) => candIndex.get(cid))
      .filter((i): i is number => i !== undefined)
    if (indices.length === 0) continue
    lines.push(`1 ${indices.join(" ")} 0`)
  }

  lines.push("0") // ballot section terminator

  for (const opt of options) {
    // Escape any double-quotes in the name (extremely rare but safe)
    lines.push(`"${opt.optionText.replace(/"/g, "'")}"`)
  }

  lines.push(`"${questionText.replace(/"/g, "'")}"`)

  return lines.join("\n") + "\n"
}

// ─── Zip builder (mirrors app/api/admin/backup/route.ts:16-45) ───────────────

type ZipEntry = { name: string; content: string }

async function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  const { ZipArchive } = (await import("archiver")) as unknown as {
    ZipArchive: new (opts?: { zlib?: { level?: number } }) => NodeJS.ReadableStream & {
      append(src: Buffer | string | NodeJS.ReadableStream, data: { name: string }): void
      finalize(): void
    }
  }
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 6 } })
    const pt = new PassThrough()
    const chunks: Buffer[] = []
    pt.on("data", (c: Buffer) => chunks.push(c))
    pt.on("end", () => resolve(Buffer.concat(chunks)))
    pt.on("error", reject)
    archive.on("error", reject)
    archive.pipe(pt)
    for (const { name, content } of entries) archive.append(content, { name })
    archive.finalize()
  })
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params

  const [electionResults, questions, votes, writeInMergeRows, tz] = await Promise.all([
    getResultsForElection(id),
    db.question.findMany({ where: { electionId: id }, orderBy: { order: "asc" } }),
    db.vote.findMany({ where: { electionId: id } }),
    db.writeInMerge.findMany({
      where: { electionId: id },
      select: { questionId: true, rawText: true, canonicalLabel: true },
    }),
    getDisplayTimeZone(),
  ])

  // Election must be completed (getResultsForElection checks but doesn't throw — verify via status)
  const election = await db.election.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, closedAt: true, endsAt: true, createdAt: true },
  })
  if (!election || election.status !== "COMPLETED") {
    return new Response("Not found or election not completed", { status: 404 })
  }

  // Build per-question merge map (same as lib/results.ts:28-32)
  const mergeMapByQuestion = new Map<string, Map<string, string>>()
  for (const m of writeInMergeRows) {
    if (!mergeMapByQuestion.has(m.questionId)) mergeMapByQuestion.set(m.questionId, new Map())
    mergeMapByQuestion.get(m.questionId)!.set(m.rawText, m.canonicalLabel)
  }

  // Filter to RANKED_CHOICE results; preserve db question order for Q-number labels
  const rankedResults = electionResults.questions.filter(
    (q): q is typeof electionResults.questions[number] & RankedQResult => q.type === "RANKED_CHOICE",
  ) as RankedQResult[]

  if (rankedResults.length === 0) {
    return new Response("No ranked-choice questions in this election", { status: 404 })
  }

  // Lookup order from db questions for Q-number filenames (Q{order+1})
  const orderByQId = new Map(questions.map((q) => [q.id, q.order]))

  const titleSlug = slugifyTitle(election.title)
  const dateSlug = formatDateSlugInTz(
    election.closedAt ?? election.endsAt ?? election.createdAt,
    tz,
  )

  // ── Single contest — return bare .blt ──────────────────────────────────────
  if (rankedResults.length === 1) {
    const qr = rankedResults[0]
    const qVotes = (votes as Vote[]).filter((v) => v.questionId === qr.questionId)
    const mergeMap = mergeMapByQuestion.get(qr.questionId) ?? new Map<string, string>()
    const blt = buildBlt(qr, qVotes, mergeMap)

    const qSlug = slugifyTitle(qr.questionText)
    const filename = `${titleSlug}-${qSlug}-${dateSlug}.blt`

    return new Response(blt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  }

  // ── Multiple contests — build zip ──────────────────────────────────────────
  const zipEntries: ZipEntry[] = []
  const fileList: string[] = []

  for (const qr of rankedResults) {
    const qOrder = orderByQId.get(qr.questionId) ?? 0
    const qLabel = `Q${qOrder + 1}`
    const qSlug = slugifyTitle(qr.questionText)
    const bltFilename = `${qLabel}-${qSlug}.blt`

    const qVotes = (votes as Vote[]).filter((v) => v.questionId === qr.questionId)
    const mergeMap = mergeMapByQuestion.get(qr.questionId) ?? new Map<string, string>()
    const blt = buildBlt(qr, qVotes, mergeMap)

    zipEntries.push({ name: bltFilename, content: blt })
    fileList.push(`  ${bltFilename}  (${qr.seats} seat${qr.seats !== 1 ? "s" : ""} · ${qr.options.length} candidates)`)
  }

  const readme = [
    `BLT Ballot Data Export`,
    `======================`,
    `Election: ${election.title}`,
    ``,
    `This archive contains one .blt file per ranked-choice contest.`,
    ``,
    `BLT is an open interchange format for instant-runoff (IRV) and single`,
    `transferable vote (STV) ballot data, compatible with:`,
    `  - OpaVote   https://www.opavote.com  (upload directly, free tier)`,
    `  - OpenSTV   (open-source desktop app)`,
    `  - python-vote-core, and other open-source tabulation tools`,
    ``,
    `Files:`,
    ...fileList,
    ``,
    `Notes:`,
    `  - Write-in candidates merged by the administrator appear under their`,
    `    canonical name (merge already applied; raw text is in audit.json).`,
    `  - All ballot lines use weight 1 (ranked tabulation is one-ballot-one-vote).`,
    `  - Ballot order within each file is not casting order (anonymized).`,
    ``,
    `Tally hash: ${electionResults.tallyHash ? `sha256:${electionResults.tallyHash}` : "(not set)"}`,
    ``,
  ].join("\n")

  zipEntries.push({ name: "README.txt", content: readme })

  const zipBuffer = await buildZip(zipEntries)
  const zipFilename = `${titleSlug}-blt-${dateSlug}.zip`

  return new Response(zipBuffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"`,
    },
  })
}
