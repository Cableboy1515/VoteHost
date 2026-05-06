import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params
  const body = await req.json().catch(() => ({}))
  const voterIds: string[] | undefined = body.voterIds

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })

  const where = voterIds
    ? { electionId, id: { in: voterIds } }
    : { electionId, invitedAt: null }

  const voters = await db.voter.findMany({ where })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  let sent = 0
  let failed = 0

  for (const voter of voters) {
    try {
      await sendBallotInvitation({
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: `${baseUrl}/vote/${voter.token}`,
        emailSubject: election.emailSubject,
        emailMessage: election.emailMessage,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
      })
      await db.voter.update({ where: { id: voter.id }, data: { invitedAt: new Date() } })
      sent++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ sent, failed })
}
