import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const rl = rateLimit(`voters:bulk-delete:${session.sub}`, { limit: 10, windowMs: 60 * 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.voterIds) || body.voterIds.length === 0) {
    return NextResponse.json({ error: "voterIds must be a non-empty array" }, { status: 400 })
  }

  const voterIds: string[] = body.voterIds

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: { status: true },
  })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })
  if (election.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Voter list cannot be modified after an election is closed" },
      { status: 409 }
    )
  }

  const voters = await db.voter.findMany({
    where: { id: { in: voterIds }, electionId },
    select: { id: true, hasVoted: true },
  })

  const voterMap = new Map(voters.map((v) => [v.id, v]))
  const toDelete = voters.filter((v) => !v.hasVoted).map((v) => v.id)
  const skippedVoted = voters.filter((v) => v.hasVoted).length
  const skippedNotFound = voterIds.filter((id) => !voterMap.has(id)).length

  if (toDelete.length > 0) {
    await db.voter.deleteMany({ where: { id: { in: toDelete } } })
  }

  return NextResponse.json({ deleted: toDelete.length, skippedVoted, skippedNotFound })
}
