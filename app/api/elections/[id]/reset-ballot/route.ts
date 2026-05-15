import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { sendBallotResetNotices, sendBallotResetAdminNotice } from "@/lib/email"

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

  const votersToNotify = await db.voter.findMany({
    where: { electionId: id, hasVoted: true },
    select: { name: true, email: true, token: true },
  })

  await db.$transaction(async (tx) => {
    await tx.vote.deleteMany({ where: { electionId: id } })
    await tx.voter.updateMany({
      where: { electionId: id },
      data: { hasVoted: false, votedAt: null, firstReminderSentAt: null, secondReminderSentAt: null },
    })
    await tx.election.update({
      where: { id },
      data: { firstVoteAt: null, ballotResetAt: new Date(), ballotResetById: session.sub },
    })
  })

  sendBallotResetNotices(votersToNotify, election).catch((err) =>
    console.error("[reset-ballot] voter notifications threw:", err)
  )
  sendBallotResetAdminNotice(election.title, session.email, votersToNotify.length).catch((err) =>
    console.error("[reset-ballot] admin notification threw:", err)
  )

  return NextResponse.json({ ok: true, votersNotified: votersToNotify.length })
}
