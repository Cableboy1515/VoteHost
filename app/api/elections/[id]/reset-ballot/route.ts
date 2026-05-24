import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { sendBallotResetNotices, sendBallotResetAdminNotice } from "@/lib/email"
import { generateVoterToken } from "@/lib/voterToken"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const election = await db.election.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, firstVoteAt: true, emailLogoUrl: true, emailFooter: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status === "COMPLETED") {
    return NextResponse.json({ error: "Election is completed — cannot reset" }, { status: 400 })
  }
  if (!election.firstVoteAt) {
    return NextResponse.json({ error: "Nothing to reset — no votes have been cast" }, { status: 400 })
  }

  // Require explicit typed confirmation and a mandatory reason to prevent accidental data loss
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const { confirmation, reason } = body as { confirmation?: string; reason?: string }

  if (confirmation !== election.title) {
    return NextResponse.json(
      { error: `Type the election title exactly to confirm: "${election.title}"` },
      { status: 400 }
    )
  }

  if (!reason || typeof reason !== "string" || reason.trim().length < 10) {
    return NextResponse.json(
      { error: "A reason of at least 10 characters is required for audit purposes" },
      { status: 400 }
    )
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  // Load voters who voted before the reset so we can notify them with fresh links
  const votedVoters = await db.voter.findMany({
    where: { electionId: id, hasVoted: true },
    select: { id: true, name: true, email: true },
  })

  // Generate new tokens for all reset voters (old magic links are invalidated)
  const votersWithNewTokens = votedVoters.map((v) => ({
    ...v,
    ...generateVoterToken(),
  }))

  await db.$transaction(async (tx) => {
    await tx.vote.deleteMany({ where: { electionId: id } })
    await tx.voter.updateMany({
      where: { electionId: id },
      data: { hasVoted: false, votedAt: null, firstReminderSentAt: null, secondReminderSentAt: null },
    })
    // Clear all history and seed one fresh token per reset voter — ballot reset
    // intentionally invalidates every prior magic link from before the reset.
    for (const v of votersWithNewTokens) {
      await tx.voterTokenHistory.deleteMany({ where: { voterId: v.id } })
      await tx.voterTokenHistory.create({ data: { voterId: v.id, tokenHash: v.tokenHash } })
    }
    await tx.election.update({
      where: { id },
      data: { firstVoteAt: null, ballotResetAt: new Date(), ballotResetById: session.sub },
    })
  })

  const votersToNotify = votersWithNewTokens.map((v) => ({
    name: v.name,
    email: v.email,
    magicLink: `${baseUrl}/vote/${v.token}`,
  }))

  sendBallotResetNotices(votersToNotify, election).catch((err) =>
    console.error("[reset-ballot] voter notifications threw:", err)
  )
  sendBallotResetAdminNotice(election.title, session.email, votersToNotify.length, reason.trim()).catch((err) =>
    console.error("[reset-ballot] admin notification threw:", err)
  )

  return NextResponse.json({ ok: true, votersNotified: votersToNotify.length })
}
