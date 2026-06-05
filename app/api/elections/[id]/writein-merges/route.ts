import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { csrfCheck } from "@/lib/csrf"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/recordActivity"
import { z } from "zod"

/**
 * GET /api/elections/[id]/writein-merges
 * Returns each write-in-enabled question with its unique raw responses (grouped
 * by exact text with counts) and any existing canonical merge mappings.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })

  const { id } = await params

  const election = await db.election.findUnique({
    where: { id },
    select: { status: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const questions = await db.question.findMany({
    where: { electionId: id, allowWriteIn: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      text: true,
      // Return pre-listed option texts so the UI can flag when a canonical label
      // matches a listed candidate (same rule as the tally overlay in lib/results.ts).
      options: { select: { id: true, text: true }, orderBy: { order: "asc" } },
    },
  })

  const merges = await db.writeInMerge.findMany({
    where: { electionId: id },
    select: { questionId: true, rawText: true, canonicalLabel: true },
  })
  const mergeIndex = new Map(merges.map((m) => [`${m.questionId}:::${m.rawText}`, m.canonicalLabel]))

  // Aggregate write-in votes per question.
  const writeInVotes = await db.vote.findMany({
    where: { electionId: id, optionId: null, writeInText: { not: null } },
    select: { questionId: true, writeInText: true },
  })

  const responsesByQuestion = new Map<string, Map<string, number>>()
  for (const v of writeInVotes) {
    if (!v.writeInText) continue
    if (!responsesByQuestion.has(v.questionId)) responsesByQuestion.set(v.questionId, new Map())
    const qMap = responsesByQuestion.get(v.questionId)!
    qMap.set(v.writeInText, (qMap.get(v.writeInText) ?? 0) + 1)
  }

  const result = questions.map((q) => {
    const rawCounts = responsesByQuestion.get(q.id) ?? new Map<string, number>()
    const entries = [...rawCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([rawText, count]) => ({
        rawText,
        count,
        canonicalLabel: mergeIndex.get(`${q.id}:::${rawText}`) ?? null,
      }))
    return {
      questionId: q.id,
      questionText: q.text,
      totalResponses: [...rawCounts.values()].reduce((s, c) => s + c, 0),
      // Pre-listed options: lets the UI detect when a canonical label matches a listed
      // candidate (exact, case-sensitive — the same rule as the tally overlay).
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      entries,
    }
  })

  return NextResponse.json({ electionStatus: election.status, questions: result })
}

const MergeBody = z.object({
  questionId: z.string(),
  rawTexts: z.array(z.string().min(1)).min(1),
  canonicalLabel: z.string().min(1).max(500),
})

/**
 * POST /api/elections/[id]/writein-merges
 * Upsert one or more raw write-in texts → a single canonical candidate label.
 * Only allowed while the election is in PENDING_REVIEW.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = MergeBody.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const { questionId, rawTexts, canonicalLabel } = parsed.data

  const election = await db.election.findUnique({
    where: { id },
    select: { status: true, title: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "Merges can only be edited while the election is in PENDING_REVIEW." },
      { status: 409 }
    )
  }

  // Verify the question belongs to this election and has allowWriteIn.
  const question = await db.question.findFirst({
    where: { id: questionId, electionId: id, allowWriteIn: true },
    select: { id: true },
  })
  if (!question) {
    return NextResponse.json({ error: "Question not found or write-in not enabled." }, { status: 404 })
  }

  // Snapshot any previous mappings for audit trail.
  const previous = await db.writeInMerge.findMany({
    where: { electionId: id, questionId, rawText: { in: rawTexts } },
    select: { rawText: true, canonicalLabel: true },
  })
  const previousMap = Object.fromEntries(previous.map((m) => [m.rawText, m.canonicalLabel]))

  // Upsert: one mapping per rawText; @@unique([electionId, questionId, rawText]) makes this idempotent.
  await db.$transaction(
    rawTexts.map((rawText) =>
      db.writeInMerge.upsert({
        where: { electionId_questionId_rawText: { electionId: id, questionId, rawText } },
        update: { canonicalLabel, mergedById: session.sub, mergedByEmail: session.email },
        create: { electionId: id, questionId, rawText, canonicalLabel, mergedById: session.sub, mergedByEmail: session.email },
      })
    )
  )

  await recordActivity({
    session,
    action: "writein.merge",
    electionId: id,
    targetType: "writein",
    targetId: questionId,
    targetLabel: election.title,
    metadata: { questionId, rawTexts, canonicalLabel, previous: previousMap },
  })

  return NextResponse.json({ ok: true })
}

const UnmergeBody = z.object({
  questionId: z.string(),
  rawText: z.string().min(1),
})

/**
 * DELETE /api/elections/[id]/writein-merges
 * Remove a single merge mapping. The raw text will tally under its own text.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const parsed = UnmergeBody.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const { questionId, rawText } = parsed.data

  const election = await db.election.findUnique({
    where: { id },
    select: { status: true, title: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "Merges can only be edited while the election is in PENDING_REVIEW." },
      { status: 409 }
    )
  }

  const existing = await db.writeInMerge.findUnique({
    where: { electionId_questionId_rawText: { electionId: id, questionId, rawText } },
    select: { canonicalLabel: true },
  })

  await db.writeInMerge.deleteMany({
    where: { electionId: id, questionId, rawText },
  })

  await recordActivity({
    session,
    action: "writein.unmerge",
    electionId: id,
    targetType: "writein",
    targetId: questionId,
    targetLabel: election.title,
    metadata: { questionId, rawText, previousCanonical: existing?.canonicalLabel ?? null },
  })

  return NextResponse.json({ ok: true })
}
