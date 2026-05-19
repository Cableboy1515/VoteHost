import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { canActivate, CANNOT_ACTIVATE_MESSAGES } from "@/lib/canActivate"
import { sendBallotInvitationsToUninvited } from "@/lib/sendBallotInvitationsToUninvited"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const election = await db.election.findUnique({
    where: { id: electionId },
    include: { _count: { select: { questions: true, voters: true } } },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "DRAFT") {
    return NextResponse.json({ error: "Election is not in Draft status." }, { status: 409 })
  }

  const check = canActivate({
    questionCount: election._count.questions,
    voterCount: election._count.voters,
    endsAt: election.endsAt,
  })
  if (!check.ok) {
    return NextResponse.json({ error: CANNOT_ACTIVATE_MESSAGES[check.reason] }, { status: 409 })
  }

  const now = new Date()

  await db.election.update({
    where: { id: electionId },
    data: {
      status: "ACTIVE",
      activatedAt: now,
      activatedById: session.sub,
      startsAt: now,
      startReminderSentAt: null,
    },
  })

  const { sent, failed } = await sendBallotInvitationsToUninvited(electionId)

  return NextResponse.json({ activated: true, sent, failed })
}
