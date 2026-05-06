import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ sent: true })
}
