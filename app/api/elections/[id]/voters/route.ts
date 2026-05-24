import { NextResponse } from "next/server"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { VotersSchema } from "@/lib/validations"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const voters = await db.voter.findMany({
    where: { electionId: id },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(voters)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  if (session.role !== "ADMIN") {
    const rl = rateLimit(`voters-import:election:${electionId}`, { limit: 100, windowMs: 3_600_000 })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)
  }

  const election = await db.election.findUnique({ where: { id: electionId }, select: { status: true } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })
  if (election.status === "COMPLETED") {
    return NextResponse.json({ error: "Voter list cannot be modified after an election is closed" }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const input = Array.isArray(body) ? body : [body]
  const parsed = VotersSchema.safeParse(input)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const result = await db.voter.createMany({
    data: parsed.data.map((voter) => ({ ...voter, electionId })),
    skipDuplicates: true,
  })

  // Re-arm the full-turnout notice so a new voter addition doesn't suppress it
  // permanently if turnout was already at 100% before this import.
  if (result.count > 0) {
    await db.election.update({
      where: { id: electionId },
      data: { fullTurnoutNoticeSentAt: null },
    })
  }

  return NextResponse.json(
    { created: result.count, skipped: parsed.data.length - result.count },
    { status: 201 }
  )
}
