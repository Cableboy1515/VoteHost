import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { sendElectionResultsEmail } from "@/lib/sendElectionResultsEmail"
import { recordActivity } from "@/lib/recordActivity"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: electionId } = await params

  const rl = rateLimit(`results-email:election:${electionId}`, { limit: 1, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const body = await req.json().catch(() => ({}))
  const force: boolean = body.force === true

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })

  if (election.status === "DRAFT" || election.status === "ACTIVE") {
    return NextResponse.json(
      { error: "Results email can only be sent after the election closes" },
      { status: 409 }
    )
  }

  if (election.resultsEmailSentAt && !force) {
    return NextResponse.json(
      { error: "alreadySent", sentAt: election.resultsEmailSentAt.toISOString() },
      { status: 409 }
    )
  }

  // For forced resend, clear the sentAt so the helper doesn't short-circuit.
  if (force && election.resultsEmailSentAt) {
    await db.election.update({
      where: { id: electionId },
      data: { resultsEmailSentAt: null },
    })
  }

  const { sentCount, failedCount } = await sendElectionResultsEmail(electionId)

  await recordActivity({
    session,
    action: "election.results_email_sent",
    electionId,
    targetType: "election",
    targetId: electionId,
    targetLabel: election.title,
    metadata: { sentCount, failedCount },
  })

  return NextResponse.json({ sent: sentCount, failed: failedCount })
}
