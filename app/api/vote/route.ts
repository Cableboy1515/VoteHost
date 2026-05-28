import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { BallotSubmissionSchema } from "@/lib/validations"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { generateBallotId, generateReceiptCode, computeBallotHash } from "@/lib/verification"
import { sendBallotReceipt, sendFullTurnoutStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { findVoterIdByToken } from "@/lib/voterToken"
import { recordActivity } from "@/lib/recordActivity"

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`vote:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const parsed = BallotSubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Your ballot couldn't be read. Please go back and try again." }, { status: 400 })

  const { token, answers } = parsed.data

  const voterId = await findVoterIdByToken(token)
  if (!voterId) return NextResponse.json({ error: "Invalid voting link" }, { status: 404 })

  const voter = await db.voter.findUnique({
    where: { id: voterId },
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
        { error: "An answer was submitted for a question that isn't on this ballot." },
        { status: 400 }
      )
    }
    if (answer.type !== question.type) {
      return NextResponse.json(
        { error: `The answer for "${question.text}" doesn't match the question type.` },
        { status: 400 }
      )
    }

    const validOptionIds = new Set(question.options.map((o) => o.id))

    if (answer.type === "SINGLE_CHOICE") {
      if (!validOptionIds.has(answer.optionId)) {
        return NextResponse.json(
          { error: `An option you selected for "${question.text}" isn't valid.` },
          { status: 400 }
        )
      }
    } else if (answer.type === "MULTIPLE_CHOICE") {
      const max = question.maxSelections ?? question.options.length
      const unique = [...new Set(answer.optionIds)]
      if (unique.length > max) {
        return NextResponse.json(
          { error: `You selected too many options for "${question.text}". Pick up to ${max}.` },
          { status: 400 }
        )
      }
      for (const oid of unique) {
        if (!validOptionIds.has(oid)) {
          return NextResponse.json(
            { error: `An option you selected for "${question.text}" isn't valid.` },
            { status: 400 }
          )
        }
      }
    } else if (answer.type === "RANKED_CHOICE") {
      const allOptionIds = [...validOptionIds].sort()
      const ranked = [...answer.rankedOptionIds].sort()
      if (new Set(answer.rankedOptionIds).size !== answer.rankedOptionIds.length) {
        return NextResponse.json(
          { error: `"${question.text}" has the same option ranked twice.` },
          { status: 400 }
        )
      }
      if (ranked.length !== allOptionIds.length || ranked.some((id, i) => id !== allOptionIds[i])) {
        return NextResponse.json(
          { error: `Please rank all ${question.options.length} options for "${question.text}".` },
          { status: 400 }
        )
      }
    } else if (answer.type === "WRITE_IN") {
      if (answer.text.length > 500) {
        return NextResponse.json(
          { error: `Your response for "${question.text}" is too long (max 500 characters).` },
          { status: 400 }
        )
      }
    }
  }

  // Enforce required questions
  const requiredIds = new Set(questions.filter((q) => q.required).map((q) => q.id))
  const answeredIds = new Set(answers.map((a) => a.questionId))
  const missing = [...requiredIds].filter((id) => !answeredIds.has(id))
  if (missing.length > 0) {
    const missingTexts = missing.map((id) => questionMap.get(id)?.text ?? id)
    return NextResponse.json(
      { error: `Some required questions weren't answered: ${missingTexts.map((t) => `"${t}"`).join(", ")}.`, missing },
      { status: 400 }
    )
  }

  const ballotId = generateBallotId()

  // Build vote records with no voter linkage — anonymity guarantee
  const voteRecords: {
    electionId: string
    questionId: string
    optionId?: string
    rank?: number
    writeInText?: string
    ballotId: string
  }[] = []

  for (const answer of answers) {
    if (answer.type === "SINGLE_CHOICE") {
      voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId: answer.optionId, ballotId })
    } else if (answer.type === "MULTIPLE_CHOICE") {
      const unique = [...new Set(answer.optionIds)]
      for (const optionId of unique) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId, ballotId })
      }
    } else if (answer.type === "RANKED_CHOICE") {
      answer.rankedOptionIds.forEach((optionId, index) => {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId, rank: index + 1, ballotId })
      })
    } else if (answer.type === "WRITE_IN") {
      voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText: answer.text, ballotId })
    }
  }

  const receiptCode = generateReceiptCode()
  const ballotHash = computeBallotHash(voteRecords.map((v) => ({
    questionId: v.questionId,
    optionId: v.optionId ?? null,
    rank: v.rank ?? null,
    writeInText: v.writeInText ?? null,
  })))

  try {
    await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      const updated = await tx.voter.updateMany({
        where: { id: voterId, hasVoted: false },
        data: { hasVoted: true, votedAt: new Date() },
      })
      if (updated.count === 0) throw new Error("ALREADY_VOTED")
      await tx.vote.createMany({ data: voteRecords })
      await tx.ballotReceipt.create({
        data: { electionId: voter.electionId, receiptCode, ballotHash },
      })
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

  // Real-time 100%-turnout notice. Stamp-first with conditional updateMany prevents
  // concurrent final votes from sending duplicates; revert on failure so the hourly
  // cron sweep can retry. Never blocks the voter's response.
  ;(async () => {
    const voters = await db.voter.findMany({
      where: { electionId: voter.electionId },
      select: { invitedAt: true, hasVoted: true },
    })
    const invited = voters.filter((v) => v.invitedAt != null)
    if (invited.length === 0) return
    if (invited.some((v) => !v.hasVoted)) return

    const stamped = await db.election.updateMany({
      where: { id: voter.electionId, fullTurnoutNoticeSentAt: null },
      data: { fullTurnoutNoticeSentAt: new Date() },
    })
    if (stamped.count !== 1) return

    try {
      const recipients = await getStaffRecipients()
      await sendFullTurnoutStaffNotice(
        { id: voter.election.id, title: voter.election.title, endsAt: voter.election.endsAt },
        recipients,
        invited.length,
        invited.length,
      )
      recordActivity({
        system: true,
        action: "election.full_turnout_notice",
        electionId: voter.electionId,
        targetType: "election",
        targetId: voter.electionId,
        targetLabel: voter.election.title,
      }).catch(() => {})
    } catch {
      await db.election.updateMany({
        where: { id: voter.electionId },
        data: { fullTurnoutNoticeSentAt: null },
      }).catch(() => {})
    }
  })().catch(() => {})

  sendBallotReceipt({
    voterEmail: voter.email,
    voterName: voter.name,
    electionTitle: voter.election.title,
    receiptCode,
    electionId: voter.electionId,
  }).catch(() => {})

  return NextResponse.json({ success: true, receiptCode })
}
