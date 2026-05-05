import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { BallotSubmissionSchema } from "@/lib/validations"

export async function POST(req: Request) {
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

  // Build vote records with no voter linkage
  const voteRecords: {
    electionId: string
    questionId: string
    optionId?: string
    rank?: number
    writeInText?: string
  }[] = []

  for (const answer of answers) {
    if (answer.type === "SINGLE_CHOICE") {
      voteRecords.push({
        electionId: voter.electionId,
        questionId: answer.questionId,
        optionId: answer.optionId,
      })
    } else if (answer.type === "MULTIPLE_CHOICE") {
      for (const optionId of answer.optionIds) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId })
      }
    } else if (answer.type === "RANKED_CHOICE") {
      answer.rankedOptionIds.forEach((optionId, index) => {
        voteRecords.push({
          electionId: voter.electionId,
          questionId: answer.questionId,
          optionId,
          rank: index + 1,
        })
      })
    } else if (answer.type === "WRITE_IN") {
      voteRecords.push({
        electionId: voter.electionId,
        questionId: answer.questionId,
        writeInText: answer.text,
      })
    }
  }

  try {
    await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      // Atomic check-and-update: only succeeds if voter hasn't voted yet
      const updated = await tx.voter.updateMany({
        where: { token, hasVoted: false },
        data: { hasVoted: true, votedAt: new Date() },
      })
      if (updated.count === 0) {
        throw new Error("ALREADY_VOTED")
      }
      // Insert votes with no voter reference — privacy guarantee
      await tx.vote.createMany({ data: voteRecords })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_VOTED") {
      return NextResponse.json({ error: "You have already voted" }, { status: 409 })
    }
    throw err
  }

  return NextResponse.json({ success: true })
}
