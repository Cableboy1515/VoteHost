import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { BallotSubmissionSchema } from "@/lib/validations"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`vote:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const parsed = BallotSubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { token, answers } = parsed.data

  const voter = await db.voter.findUnique({
    where: { token },
    include: { election: true },
  })
  if (!voter) return NextResponse.json({ error: "Invalid voting link" }, { status: 404 })
  if (voter.election.status !== "ACTIVE") {
    return NextResponse.json({ error: "Election is not active" }, { status: 403 })
  }

  const now = new Date()
  if (voter.election.startsAt && now < voter.election.startsAt) {
    return NextResponse.json({ error: "Election has not started yet" }, { status: 403 })
  }
  if (voter.election.endsAt && now > voter.election.endsAt) {
    return NextResponse.json({ error: "Election has ended" }, { status: 403 })
  }

  // Load the election's actual questions and options for server-side validation
  const questions = await db.question.findMany({
    where: { electionId: voter.electionId },
    include: { options: true },
  })
  const questionMap = new Map(questions.map((q) => [q.id, q]))

  // Validate every submitted answer against the real ballot structure
  for (const answer of answers) {
    const question = questionMap.get(answer.questionId)
    if (!question) {
      return NextResponse.json(
        { error: `Question ${answer.questionId} does not belong to this election` },
        { status: 400 }
      )
    }
    if (answer.type !== question.type) {
      return NextResponse.json(
        { error: `Answer type mismatch for question ${answer.questionId}` },
        { status: 400 }
      )
    }

    const validOptionIds = new Set(question.options.map((o) => o.id))

    if (answer.type === "SINGLE_CHOICE") {
      if (!validOptionIds.has(answer.optionId)) {
        return NextResponse.json({ error: "Invalid option" }, { status: 400 })
      }
    } else if (answer.type === "MULTIPLE_CHOICE") {
      const max = question.maxSelections ?? question.options.length
      const unique = [...new Set(answer.optionIds)]
      if (unique.length > max) {
        return NextResponse.json(
          { error: `Too many selections for question ${answer.questionId}` },
          { status: 400 }
        )
      }
      for (const oid of unique) {
        if (!validOptionIds.has(oid)) {
          return NextResponse.json({ error: "Invalid option" }, { status: 400 })
        }
      }
    } else if (answer.type === "RANKED_CHOICE") {
      const allOptionIds = [...validOptionIds].sort()
      const ranked = [...answer.rankedOptionIds].sort()
      if (
        ranked.length !== allOptionIds.length ||
        ranked.some((id, i) => id !== allOptionIds[i]) ||
        new Set(answer.rankedOptionIds).size !== answer.rankedOptionIds.length
      ) {
        return NextResponse.json(
          { error: `Ranked answer must include each option exactly once for question ${answer.questionId}` },
          { status: 400 }
        )
      }
    } else if (answer.type === "WRITE_IN") {
      if (answer.text.length > 500) {
        return NextResponse.json({ error: "Write-in response exceeds 500 characters" }, { status: 400 })
      }
    }
  }

  // Enforce required questions
  const requiredIds = new Set(questions.filter((q) => q.required).map((q) => q.id))
  const answeredIds = new Set(answers.map((a) => a.questionId))
  const missing = [...requiredIds].filter((id) => !answeredIds.has(id))
  if (missing.length > 0) {
    return NextResponse.json({ error: "Missing required questions", missing }, { status: 400 })
  }

  // Build vote records with no voter linkage — anonymity guarantee
  const voteRecords: {
    electionId: string
    questionId: string
    optionId?: string
    rank?: number
    writeInText?: string
  }[] = []

  for (const answer of answers) {
    if (answer.type === "SINGLE_CHOICE") {
      voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId: answer.optionId })
    } else if (answer.type === "MULTIPLE_CHOICE") {
      const unique = [...new Set(answer.optionIds)]
      for (const optionId of unique) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId })
      }
    } else if (answer.type === "RANKED_CHOICE") {
      answer.rankedOptionIds.forEach((optionId, index) => {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId, rank: index + 1 })
      })
    } else if (answer.type === "WRITE_IN") {
      voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText: answer.text })
    }
  }

  try {
    await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      const updated = await tx.voter.updateMany({
        where: { token, hasVoted: false },
        data: { hasVoted: true, votedAt: new Date() },
      })
      if (updated.count === 0) throw new Error("ALREADY_VOTED")
      await tx.vote.createMany({ data: voteRecords })
      await tx.election.updateMany({
        where: { id: voter.electionId, firstVoteAt: null },
        data: { firstVoteAt: new Date() },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_VOTED") {
      return NextResponse.json({ error: "You have already voted" }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ success: true })
}
