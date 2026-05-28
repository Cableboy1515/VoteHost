import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionSchema } from "@/lib/validations"
import { recordActivity } from "@/lib/recordActivity"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const elections = await db.election.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { voters: true } } },
  })

  const electionIds = elections.map((e) => e.id)
  const votedCountRows = electionIds.length > 0
    ? await db.voter.groupBy({
        by: ["electionId"],
        where: { electionId: { in: electionIds }, hasVoted: true },
        _count: { _all: true },
      })
    : []
  const votedByElection = new Map(votedCountRows.map((r) => [r.electionId, r._count._all]))

  const withVotedCount = elections.map((e) => ({
    ...e,
    votedCount: votedByElection.get(e.id) ?? 0,
  }))

  return NextResponse.json(withVotedCount)
}

export async function POST(req: Request) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const parsed = ElectionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const election = await db.election.create({ data: parsed.data })
  await recordActivity({
    session,
    action: "election.create",
    electionId: election.id,
    targetType: "election",
    targetId: election.id,
    targetLabel: election.title,
  })
  return NextResponse.json(election, { status: 201 })
}
