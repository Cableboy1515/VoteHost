import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`invite-test:${session.sub}`, { limit: 5, windowMs: 3_600_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { id: electionId } = await params
  const body = await req.json().catch(() => ({}))
  const to: string = body.to

  if (!to) return NextResponse.json({ error: "Recipient email required" }, { status: 400 })

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  const { error } = await sendBallotInvitation({
    voterName: "Preview Voter",
    voterEmail: to,
    electionTitle: election.title,
    magicLink: `${baseUrl}/vote/preview-link`,
    emailSubject: election.emailSubject,
    emailMessage: election.emailMessage,
    emailLogoUrl: election.emailLogoUrl,
    emailFooter: election.emailFooter,
  })

  if (error) {
    console.error("[invite/test]", error)
    return NextResponse.json({ error: "Failed to send test email — check email settings" }, { status: 500 })
  }
  return NextResponse.json({ sent: true })
}
