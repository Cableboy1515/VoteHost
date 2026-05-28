import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { csrfCheck } from "@/lib/csrf"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { sendActivationCancelledVoterNotices, sendActivationCancelledAdminNotice } from "@/lib/email"
import { recordActivity } from "@/lib/recordActivity"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = csrfCheck(req)
  if (csrf) return csrf

  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  const rl = rateLimit(`cancel-activation:${id}`, { limit: 1, windowMs: 5 * 60 * 1000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const election = await db.election.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, firstVoteAt: true },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (election.status !== "ACTIVE") {
    return NextResponse.json({ error: "Election is not active." }, { status: 409 })
  }
  if (election.firstVoteAt) {
    return NextResponse.json(
      { error: "Votes have already been cast. To edit the ballot, use Discard & Reopen instead." },
      { status: 409 }
    )
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

  const { confirmation } = body as { confirmation?: string }
  if (confirmation !== election.title) {
    return NextResponse.json(
      { error: `Type the election title exactly to confirm: "${election.title}"` },
      { status: 400 }
    )
  }

  // Load invited voters before reverting so we can notify them
  const invitedVoters = await db.voter.findMany({
    where: { electionId: id, invitedAt: { not: null } },
    select: { name: true, email: true },
  })

  // Guarded update — closes the race window between our read and write:
  // only proceeds if the election is still ACTIVE with no votes. Bundled
  // with a voter reset so that re-activation re-fires invitations via the
  // existing `sendBallotInvitationsToUninvited` path (which keys on
  // `invitedAt: null`). Tokens are intentionally NOT rotated — voters keep
  // the same magic link, matching ElectionBuddy/OpaVote behavior.
  const [updated] = await db.$transaction([
    db.election.updateMany({
      where: { id, status: "ACTIVE", firstVoteAt: null },
      data: {
        status: "DRAFT",
        activatedAt: null,
        activatedById: null,
        startsAt: null,
        autoActivate: false,
        startReminderSentAt: null,
        autoActivateFailedNoticeSentAt: null,
      },
    }),
    db.voter.updateMany({
      where: { electionId: id },
      data: {
        invitedAt: null,
        firstReminderSentAt: null,
        secondReminderSentAt: null,
      },
    }),
  ])

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Votes have already been cast. To edit the ballot, use Discard & Reopen instead." },
      { status: 409 }
    )
  }

  sendActivationCancelledVoterNotices(invitedVoters, election.title).catch((err) =>
    console.error("[cancel-activation] voter notifications threw:", err)
  )
  sendActivationCancelledAdminNotice(election.title, session.email, invitedVoters.length).catch((err) =>
    console.error("[cancel-activation] admin notification threw:", err)
  )

  await recordActivity({
    session,
    action: "election.cancel_activation",
    electionId: id,
    targetType: "election",
    targetId: id,
    targetLabel: election.title,
    metadata: { votersNotified: invitedVoters.length },
  })

  return NextResponse.json({ ok: true, votersNotified: invitedVoters.length })
}
