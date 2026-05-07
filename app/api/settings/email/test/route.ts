import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { sendBallotInvitation } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"

export async function POST(req: Request) {
  const session = await requireRole("ADMIN")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`email-test:admin:${session.sub}`, { limit: 5, windowMs: 3_600_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

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
    console.error("[settings/email/test]", result.error)
    return NextResponse.json({ error: "Failed to send test email — check provider settings" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
