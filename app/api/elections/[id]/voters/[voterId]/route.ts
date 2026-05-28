import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { recordActivity } from "@/lib/recordActivity"

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; voterId: string }> }
) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId, voterId } = await params

  const voter = await db.voter.findUnique({ where: { id: voterId }, include: { election: true } })
  if (!voter || voter.electionId !== electionId) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 })
  }

  if (voter.hasVoted) {
    return NextResponse.json(
      { error: "Cannot remove a voter who has already cast their ballot" },
      { status: 409 }
    )
  }

  if (voter.election.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Voter list cannot be modified after an election is closed" },
      { status: 409 }
    )
  }

  await db.voter.delete({ where: { id: voterId } })
  await recordActivity({
    session,
    action: "voter.delete",
    electionId,
    targetType: "voter",
    targetId: voterId,
    targetLabel: `${voter.name} <${voter.email}>`,
  })
  return NextResponse.json({ ok: true })
}
