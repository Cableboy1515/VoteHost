import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"
import { csrfCheck } from "@/lib/csrf"
import { recordActivity } from "@/lib/recordActivity"

const PatchVoterSchema = z.object({ weight: z.number().int().min(1) })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; voterId: string }> }
) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId, voterId } = await params

  const body = await req.json().catch(() => null)
  const parsed = PatchVoterSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid weight" }, { status: 400 })

  const voter = await db.voter.findUnique({ where: { id: voterId }, include: { election: true } })
  if (!voter || voter.electionId !== electionId) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 })
  }
  if (voter.hasVoted) {
    return NextResponse.json({ error: "Weight cannot be changed after a voter has cast their ballot" }, { status: 409 })
  }
  if (voter.election.status === "COMPLETED") {
    return NextResponse.json({ error: "Voter list cannot be modified after an election is closed" }, { status: 409 })
  }

  await db.voter.update({ where: { id: voterId }, data: { weight: parsed.data.weight } })
  await recordActivity({
    session,
    action: "voter.edit",
    electionId,
    targetType: "voter",
    targetId: voterId,
    targetLabel: `${voter.name} <${voter.email}>`,
    metadata: { field: "weight", value: parsed.data.weight },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; voterId: string }> }
) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf
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
