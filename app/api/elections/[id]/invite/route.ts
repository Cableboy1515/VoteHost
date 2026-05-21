import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { generateVoterToken } from "@/lib/voterToken"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const rl = rateLimit(`invite:election:${electionId}`, { limit: 1, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const voterIds: string[] | undefined = body.voterIds

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })

  if (election.status !== "ACTIVE") {
    return NextResponse.json(
      { error: election.status === "COMPLETED" ? "Election is closed." : "Activate the election before sending invitations." },
      { status: 409 }
    )
  }

  const where = voterIds
    ? { electionId, id: { in: voterIds } }
    : { electionId, invitedAt: null }

  const voters = await db.voter.findMany({
    where,
    select: { id: true, name: true, email: true },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  let sent = 0
  let failed = 0

  for (const voter of voters) {
    try {
      const { token, tokenHash } = generateVoterToken()
      await db.voter.update({ where: { id: voter.id }, data: { tokenHash } })

      const { error } = await sendBallotInvitation({
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: `${baseUrl}/vote/${token}`,
        emailSubject: election.emailSubject,
        emailMessage: election.emailMessage,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
        endsAt: election.endsAt?.toISOString(),
      })
      if (error) { failed++; continue }
      await db.voter.update({ where: { id: voter.id }, data: { invitedAt: new Date() } })
      sent++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ sent, failed })
}
