import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { sendOneInvite } from "@/lib/voterInvite"
import { recordActivity } from "@/lib/recordActivity"

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
    select: { id: true, electionId: true, name: true, email: true, invitedAt: true, hasVoted: true, lastSendStatus: true, election: true },
  })

  if (!voter || voter.electionId !== electionId) {
    return NextResponse.json({ error: "Voter not found" }, { status: 404 })
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const status = await sendOneInvite(voter, voter.election, baseUrl)

  switch (status) {
    case "sent":
      await recordActivity({
        session,
        action: "voter.invite_resent",
        electionId,
        targetType: "voter",
        targetId: voterId,
        targetLabel: `${voter.name} <${voter.email}>`,
      })
      return NextResponse.json({ ok: true })
    case "voted":
      return NextResponse.json({ error: "Voter has already voted" }, { status: 409 })
    case "not_invited":
      return NextResponse.json(
        { error: "Voter has not been invited yet — use Send Invitations" },
        { status: 409 }
      )
    case "election_not_active":
      return NextResponse.json(
        {
          error:
            voter.election.status === "COMPLETED"
              ? "Election is closed."
              : "Activate the election before sending invitations.",
        },
        { status: 409 }
      )
    case "failed":
      return NextResponse.json({ error: "Failed to send invitation" }, { status: 502 })
  }
}
