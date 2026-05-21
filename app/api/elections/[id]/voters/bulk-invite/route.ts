import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { sendOneInvite } from "@/lib/voterInvite"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.voterIds) || body.voterIds.length === 0) {
    return NextResponse.json({ error: "voterIds must be a non-empty array" }, { status: 400 })
  }

  const voterIds: string[] = body.voterIds

  const election = await db.election.findUnique({
    where: { id: electionId },
    select: {
      id: true,
      status: true,
      title: true,
      emailSubject: true,
      emailMessage: true,
      emailLogoUrl: true,
      emailFooter: true,
      endsAt: true,
    },
  })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })
  if (election.status !== "ACTIVE") {
    return NextResponse.json(
      {
        error:
          election.status === "COMPLETED"
            ? "Election is closed."
            : "Activate the election before sending invitations.",
      },
      { status: 409 }
    )
  }

  const voters = await db.voter.findMany({
    where: { id: { in: voterIds }, electionId },
    select: { id: true, name: true, email: true, invitedAt: true, hasVoted: true },
  })

  const voterMap = new Map(voters.map((v) => [v.id, v]))
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  let sent = 0
  let skippedRateLimited = 0
  let skippedAlreadyVoted = 0
  let skippedNotInvited = 0
  let failed = 0
  const skippedNotFound = voterIds.filter((id) => !voterMap.has(id)).length
  let adminRateLimited = false

  for (const voterId of voterIds) {
    const voter = voterMap.get(voterId)
    if (!voter) continue

    if (adminRateLimited) {
      skippedRateLimited++
      continue
    }

    // Per-voter cooldown: 1 per 5 min (same key as single-voter route)
    const rlVoter = rateLimit(`invite:voter:${voterId}`, { limit: 1, windowMs: 5 * 60_000 })
    if (!rlVoter.ok) {
      skippedRateLimited++
      continue
    }

    // Admin hourly cap: 30 per hour (same key as single-voter route)
    const rlAdmin = rateLimit(`invite:admin:${session.sub}`, { limit: 30, windowMs: 60 * 60_000 })
    if (!rlAdmin.ok) {
      adminRateLimited = true
      skippedRateLimited++
      continue
    }

    const status = await sendOneInvite(voter, election, baseUrl)
    switch (status) {
      case "sent":             sent++;                break
      case "voted":            skippedAlreadyVoted++; break
      case "not_invited":      skippedNotInvited++;   break
      case "election_not_active": skippedRateLimited++; break
      case "failed":           failed++;              break
    }
  }

  return NextResponse.json({ sent, skippedRateLimited, skippedAlreadyVoted, skippedNotInvited, failed, skippedNotFound })
}
