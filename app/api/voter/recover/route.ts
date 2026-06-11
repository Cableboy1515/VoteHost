import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { VoterRecoveryRequestSchema } from "@/lib/validations"
import { generateVoterToken, replaceAllVoterTokens } from "@/lib/voterToken"
import { sendBallotRecoveryLink } from "@/lib/email"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { absolutizeUrl } from "@/lib/absolutize-url"
import { getClientIp } from "@/lib/clientIp"

const VOTER_COOLDOWN_MS = 5 * 60 * 1000

export async function POST(req: Request) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const ip = getClientIp(req)
  const rl = rateLimit(`voter-recover:ip:${ip}`, { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const parsed = VoterRecoveryRequestSchema.safeParse(body)
  // Always 204 — no voter enumeration
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const { email } = parsed.data

  const matches = await db.voter.findMany({
    where: {
      email,
      election: { status: { in: ["DRAFT", "ACTIVE"] } },
      OR: [
        { hasVoted: false },
        { hasVoted: true, election: { allowBallotReplacement: true } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      recoveryRequestedAt: true,
      election: {
        select: {
          id: true,
          title: true,
          endsAt: true,
          emailLogoUrl: true,
          emailFooter: true,
        },
      },
    },
  })

  for (const voter of matches) {
    const tooSoon =
      voter.recoveryRequestedAt != null &&
      Date.now() - voter.recoveryRequestedAt.getTime() < VOTER_COOLDOWN_MS
    if (tooSoon) continue

    const { token, tokenHash } = generateVoterToken()
    const magicLink = absolutizeUrl(`/vote/${token}`)

    let sent = false
    try {
      await sendBallotRecoveryLink({
        voter: { name: voter.name, email: voter.email },
        election: voter.election,
        magicLink,
      })
      sent = true
    } catch (err) {
      console.error("[voter-recover] send threw:", err)
    }

    if (!sent) continue

    await replaceAllVoterTokens(voter.id, tokenHash)
    await db.voter.update({
      where: { id: voter.id },
      data: { recoveryRequestedAt: new Date() },
    })
  }

  return new NextResponse(null, { status: 204 })
}
