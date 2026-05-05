import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionSchema } from "@/lib/validations"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const elections = await db.election.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { voters: true } },
    },
  })

  const withVotedCount = await Promise.all(
    elections.map(async (election) => ({
      ...election,
      votedCount: await db.voter.count({ where: { electionId: election.id, hasVoted: true } }),
    }))
  )

  return NextResponse.json(withVotedCount)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const parsed = ElectionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const election = await db.election.create({ data: parsed.data })
  return NextResponse.json(election, { status: 201 })
}
