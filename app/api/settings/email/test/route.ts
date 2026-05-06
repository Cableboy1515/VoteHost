import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { sendBallotInvitation } from "@/lib/email"

export async function POST(req: Request) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { to } = await req.json().catch(() => ({}))
  if (!to) return NextResponse.json({ error: "Missing recipient email" }, { status: 400 })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  const result = await sendBallotInvitation({
    voterName: "Test Voter",
    voterEmail: to,
    electionTitle: "Test Election",
    magicLink: `${baseUrl}/vote/test-token`,
  })

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
