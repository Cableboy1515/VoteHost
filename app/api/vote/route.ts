import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { BallotSubmissionSchema } from "@/lib/validations"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { generateBallotId, generateReceiptCode, computeBallotHash, normalizeReceiptCode, findBallotIdByHash } from "@/lib/verification"
import { sendBallotReceipt, sendBallotReplacedNotice, sendFullTurnoutStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { findVoterIdByToken } from "@/lib/voterToken"
import { recordActivity } from "@/lib/recordActivity"
import { getClientIp } from "@/lib/clientIp"

function alreadyVotedResponse(canReplace: boolean) {
  if (canReplace) {
    return NextResponse.json({ error: "You have already voted", canReplace: true }, { status: 409 })
  }
  return NextResponse.json({ error: "You have already voted" }, { status: 409 })
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rl = rateLimit(`vote:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const parsed = BallotSubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Your ballot couldn't be read. Please go back and try again." }, { status: 400 })

  const { token, answers, receiptCode: submittedReceiptCode } = parsed.data

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

  // ── Early hasVoted checks — receipt validation before expensive answer validation ──
  let resolvedBallotId: string | null = null
  let existingReceiptId: string | null = null
  if (voter.hasVoted) {
    if (!voter.election.allowBallotReplacement) {
      return alreadyVotedResponse(false)
    }
    if (!submittedReceiptCode) {
      return alreadyVotedResponse(true)
    }
    // Rate-limit replacement attempts per voter
    const revoteRl = rateLimit(`revote:voter:${voterId}`, { limit: 3, windowMs: 3_600_000 })
    if (!revoteRl.ok) return rateLimitResponse(revoteRl.resetAt)

    // Validate receipt code and resolve ballotId early — before expensive answer validation
    const normalizedCode = normalizeReceiptCode(submittedReceiptCode)
    if (!normalizedCode) {
      return NextResponse.json({ error: "Invalid receipt code" }, { status: 400 })
    }
    const existingReceipt = await db.ballotReceipt.findUnique({
      where: { receiptCode: normalizedCode },
    })
    if (!existingReceipt || existingReceipt.electionId !== voter.electionId) {
      return NextResponse.json({ error: "Invalid receipt code" }, { status: 400 })
    }
    existingReceiptId = existingReceipt.id

    // Fast-path: use stored ballotId if available (receipts created after this deploy)
    if (existingReceipt.ballotId) {
      resolvedBallotId = existingReceipt.ballotId
    } else {
      // Fallback: O(all votes) scan for receipts created before ballotId column was added
      const allVotes = await db.vote.findMany({
        where: { electionId: voter.electionId },
        select: { ballotId: true, questionId: true, optionId: true, rank: true, writeInText: true, weight: true },
      })
      resolvedBallotId = findBallotIdByHash(allVotes, existingReceipt.ballotHash)
    }
    if (!resolvedBallotId) {
      return NextResponse.json({ error: "Invalid receipt code" }, { status: 400 })
    }
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
      if (answer.writeInText) {
        if (!question.allowWriteIn) {
          return NextResponse.json(
            { error: `Write-in is not allowed for "${question.text}".` },
            { status: 400 }
          )
        }
        // Length already enforced by Zod (max 500)
      } else {
        if (!answer.optionId || !validOptionIds.has(answer.optionId)) {
          return NextResponse.json(
            { error: `An option you selected for "${question.text}" isn't valid.` },
            { status: 400 }
          )
        }
      }
    } else if (answer.type === "MULTIPLE_CHOICE") {
      const writeInTexts = answer.writeInTexts ?? []
      if (writeInTexts.length > 0 && !question.allowWriteIn) {
        return NextResponse.json(
          { error: `Write-in is not allowed for "${question.text}".` },
          { status: 400 }
        )
      }
      const max = question.maxSelections
        ?? (question.options.length + (question.allowWriteIn ? question.writeInSlots : 0))
      const uniqueOptionIds = [...new Set(answer.optionIds)]
      const uniqueWriteIns = [...new Set(writeInTexts)]
      if (question.allowWriteIn && uniqueWriteIns.length > question.writeInSlots) {
        return NextResponse.json(
          { error: `You can write in up to ${question.writeInSlots} candidate(s) for "${question.text}".` },
          { status: 400 }
        )
      }
      if (uniqueOptionIds.length + uniqueWriteIns.length > max) {
        return NextResponse.json(
          { error: `You selected too many options for "${question.text}". Pick up to ${max}.` },
          { status: 400 }
        )
      }
      for (const oid of uniqueOptionIds) {
        if (!validOptionIds.has(oid)) {
          return NextResponse.json(
            { error: `An option you selected for "${question.text}" isn't valid.` },
            { status: 400 }
          )
        }
      }
    } else if (answer.type === "RANKED_CHOICE") {
      const items = answer.rankedItems
      const seenOptionIds = new Set<string>()
      for (const item of items) {
        if ("optionId" in item) {
          if (seenOptionIds.has(item.optionId)) {
            return NextResponse.json(
              { error: `"${question.text}" has the same option ranked twice.` },
              { status: 400 }
            )
          }
          seenOptionIds.add(item.optionId)
          if (!validOptionIds.has(item.optionId)) {
            return NextResponse.json(
              { error: `An option you ranked for "${question.text}" isn't valid.` },
              { status: 400 }
            )
          }
        } else {
          if (!question.allowWriteIn) {
            return NextResponse.json(
              { error: `Write-in is not allowed for "${question.text}".` },
              { status: 400 }
            )
          }
          // Length already enforced by Zod (max 500)
        }
      }
    } else if (answer.type === "COMMENT") {
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

  // Denormalize voter weight onto anonymous vote rows — preserves ballot secrecy
  // (no voterId ever written to Vote) while allowing weighted tallies.
  const voterWeight = voter.weight ?? 1

  // Build vote records with no voter linkage — anonymity guarantee
  const voteRecords: {
    electionId: string
    questionId: string
    optionId?: string
    rank?: number
    writeInText?: string
    ballotId: string
    weight: number
  }[] = []

  for (const answer of answers) {
    if (answer.type === "SINGLE_CHOICE") {
      if (answer.writeInText) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText: answer.writeInText, ballotId, weight: voterWeight })
      } else {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId: answer.optionId!, ballotId, weight: voterWeight })
      }
    } else if (answer.type === "MULTIPLE_CHOICE") {
      for (const optionId of [...new Set(answer.optionIds)]) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId, ballotId, weight: voterWeight })
      }
      for (const writeInText of [...new Set(answer.writeInTexts ?? [])]) {
        voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText, ballotId, weight: voterWeight })
      }
    } else if (answer.type === "RANKED_CHOICE") {
      answer.rankedItems.forEach((item, index) => {
        if ("optionId" in item) {
          voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, optionId: item.optionId, rank: index + 1, ballotId, weight: voterWeight })
        } else {
          voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText: item.writeInText, rank: index + 1, ballotId, weight: voterWeight })
        }
      })
    } else if (answer.type === "COMMENT") {
      voteRecords.push({ electionId: voter.electionId, questionId: answer.questionId, writeInText: answer.text, ballotId, weight: voterWeight })
    }
  }

  const receiptCode = generateReceiptCode()
  const ballotHash = computeBallotHash(voteRecords.map((v) => ({
    questionId: v.questionId,
    optionId: v.optionId ?? null,
    rank: v.rank ?? null,
    writeInText: v.writeInText ?? null,
    weight: v.weight,
  })))

  // ── Ballot replacement path ──────────────────────────────────────────────
  // resolvedBallotId and existingReceiptId are set in the early hasVoted block above.
  if (voter.hasVoted && submittedReceiptCode && resolvedBallotId && existingReceiptId) {
    try {
      await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
        const deleted = await tx.vote.deleteMany({ where: { ballotId: resolvedBallotId! } })
        if (deleted.count === 0) throw new Error("CONCURRENT_REPLACEMENT")
        await tx.ballotReceipt.delete({ where: { id: existingReceiptId! } })
        await tx.vote.createMany({ data: voteRecords })
        await tx.ballotReceipt.create({
          data: { electionId: voter.electionId, receiptCode, ballotHash, ballotId },
        })
        await tx.voter.update({
          where: { id: voterId },
          data: { votedAt: new Date() },
        })
      })
    } catch (err) {
      if (err instanceof Error && err.message === "CONCURRENT_REPLACEMENT") {
        return NextResponse.json({ error: "Invalid receipt code" }, { status: 400 })
      }
      throw err
    }

    recordActivity({
      system: true,
      action: "ballot.replaced",
      electionId: voter.electionId,
      targetType: "election",
      targetId: voter.electionId,
      targetLabel: voter.election.title,
    }).catch(() => {})

    sendBallotReplacedNotice({
      voterEmail: voter.email,
      voterName: voter.name,
      electionTitle: voter.election.title,
      receiptCode,
      electionId: voter.electionId,
    }).catch(() => {})

    return NextResponse.json({ success: true, receiptCode, replaced: true })
  }

  // ── First-vote path ──────────────────────────────────────────────────────
  try {
    await db.$transaction(async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
      const updated = await tx.voter.updateMany({
        where: { id: voterId, hasVoted: false },
        data: { hasVoted: true, votedAt: new Date() },
      })
      if (updated.count === 0) throw new Error("ALREADY_VOTED")
      await tx.vote.createMany({ data: voteRecords })
      await tx.ballotReceipt.create({
        data: { electionId: voter.electionId, receiptCode, ballotHash, ballotId },
      })
      await tx.election.updateMany({
        where: { id: voter.electionId, firstVoteAt: null },
        data: { firstVoteAt: new Date() },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_VOTED") {
      return alreadyVotedResponse(voter.election.allowBallotReplacement)
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
    allowBallotReplacement: voter.election.allowBallotReplacement,
  }).catch(() => {})

  return NextResponse.json({ success: true, receiptCode })
}
