export const dynamic = "force-dynamic"

import { NextResponse, after } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitationsToUninvited } from "@/lib/sendBallotInvitationsToUninvited"
import { startProgress, recordSent, recordFailed, finishProgress, getProgress } from "@/lib/activationProgress"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: { status: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "ACTIVE") {
    return NextResponse.json({ error: "Election is not active." }, { status: 409 })
  }

  const existing = getProgress(electionId)
  if (existing?.running) {
    return NextResponse.json({ error: "Invitations are already sending." }, { status: 409 })
  }

  const total = await db.voter.count({ where: { electionId, invitedAt: null } })
  if (total === 0) {
    return NextResponse.json({ sending: false, total: 0 })
  }

  startProgress(electionId, total)

  after(() =>
    sendBallotInvitationsToUninvited(electionId, {
      onSent: () => recordSent(electionId),
      onFailed: () => recordFailed(electionId),
    })
      .then((r) => finishProgress(electionId, r))
      .catch((err) => finishProgress(electionId, { sent: 0, failed: total, stopped: true, lastError: String(err) }))
  )

  return NextResponse.json({ sending: true, total }, { status: 202 })
}
