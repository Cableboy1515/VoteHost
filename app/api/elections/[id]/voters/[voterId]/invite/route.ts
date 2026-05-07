import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; voterId: string }> }
) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId, voterId } = await params

  const rlVoter = rateLimit(`invite:voter:${voterId}`, { limit: 1, windowMs: 5 * 60_000 })
  if (!rlVoter.ok) return rateLimitResponse(rlVoter.resetAt)

  const rlAdmin = rateLimit(`invite:admin:${session.sub}`, { limit: 30, windowMs: 60 * 60_000 })
  if (!rlAdmin.ok) return rateLimitResponse(rlAdmin.resetAt)

  const voter = await db.voter.findUnique({
    where: { id: voterId },
    include: { election: true },
  })

  if (!voter || voter.electionId !== electionId) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 })
  }
  if (voter.invitedAt === null) {
    return NextResponse.json(
      { error: "Voter has not been invited yet — use Send Invitations" },
      { status: 409 }
    )
  }
  if (voter.hasVoted) {
    return NextResponse.json({ error: "Voter has already voted" }, { status: 409 })
  }
  if (voter.election.status === "CLOSED" || voter.election.status === "COMPLETED") {
    return NextResponse.json({ error: "Election is closed" }, { status: 409 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const { election } = voter

  const { error } = await sendBallotInvitation({
    voterName: voter.name,
    voterEmail: voter.email,
    electionTitle: election.title,
    magicLink: `${baseUrl}/vote/${voter.token}`,
    emailSubject: election.emailSubject,
    emailMessage: election.emailMessage,
    emailLogoUrl: election.emailLogoUrl,
    emailFooter: election.emailFooter,
    endsAt: election.endsAt?.toISOString(),
  })

  if (error) return NextResponse.json({ error }, { status: 502 })

  await db.voter.update({ where: { id: voterId }, data: { invitedAt: new Date() } })

  return NextResponse.json({ ok: true })
}
