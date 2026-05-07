import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation, type ResultsQuestion } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { getResultsForElection } from "@/lib/results"

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

  const raw = await getResultsForElection(electionId)

  const turnoutPct =
    raw.totalVoters > 0 ? Math.round((raw.votedCount / raw.totalVoters) * 100) : 0

  const questions: ResultsQuestion[] = raw.questions.map((q) => {
    if (q.type === "WRITE_IN") {
      return {
        questionText: q.questionText,
        type: "WRITE_IN" as const,
        writeInCount: (q as { writeIns?: string[] }).writeIns?.length ?? 0,
      }
    }

    const rawOptions = (q as { options?: Array<{ optionText: string; count?: number; firstChoiceCount?: number }> }).options ?? []
    const getCount = (o: { count?: number; firstChoiceCount?: number }) =>
      q.type === "RANKED_CHOICE" ? (o.firstChoiceCount ?? 0) : (o.count ?? 0)

    const sorted = [...rawOptions].sort((a, b) => getCount(b) - getCount(a))
    const total = sorted.reduce((sum, o) => sum + getCount(o), 0)

    const options = sorted.map((o, i) => ({
      optionText: o.optionText,
      count: getCount(o),
      pct: total > 0 ? Math.round((getCount(o) / total) * 100) : 0,
      winner: i === 0 && getCount(o) > 0,
    }))

    return {
      questionText: q.questionText,
      type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE",
      options,
    }
  })

  const resultsPayload = { totalVoters: raw.totalVoters, votedCount: raw.votedCount, turnoutPct, questions }

  const voters = await db.voter.findMany({
    where: { electionId, invitedAt: { not: null } },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  let sent = 0
  let failed = 0

  for (const voter of voters) {
    const { error } = await sendBallotInvitation(
      {
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: `${baseUrl}/vote/${voter.token}`,
        emailSubject: election.emailSubject,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
        endsAt: election.endsAt?.toISOString(),
        results: resultsPayload,
      },
      "results"
    )
    if (error) { failed++; continue }
    sent++
  }

  await db.election.update({
    where: { id: electionId },
    data: { resultsEmailSentAt: new Date() },
  })

  return NextResponse.json({ sent, failed })
}
