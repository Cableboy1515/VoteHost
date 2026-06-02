import { NextResponse } from "next/server"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendBallotInvitation, type ResultsQuestion } from "@/lib/email"
import { rateLimit, rateLimitResponse } from "@/lib/rateLimit"
import { getResultsForElection } from "@/lib/results"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rl = rateLimit(`results-email-test:${session.sub}`, { limit: 5, windowMs: 3_600_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetAt)

  const { id: electionId } = await params
  const body = await req.json().catch(() => ({}))
  const to: string = body.to
  if (!to) return NextResponse.json({ error: "Recipient email required" }, { status: 400 })

  const election = await db.election.findUnique({ where: { id: electionId } })
  if (!election) return NextResponse.json({ error: "Election not found" }, { status: 404 })

  const raw = await getResultsForElection(electionId)
  const turnoutPct =
    raw.totalVoters > 0 ? Math.round((raw.votedCount / raw.totalVoters) * 100) : 0

  const questions: ResultsQuestion[] = raw.questions.flatMap((q) => {
    // COMMENT questions are omitted from voter results email
    if (q.type === "COMMENT") return []
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
    return [{
      questionText: q.questionText,
      type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE",
      options,
    }]
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  const { error } = await sendBallotInvitation(
    {
      voterName: "Preview Voter",
      voterEmail: to,
      electionTitle: election.title,
      magicLink: `${baseUrl}/vote/preview-link`,
      emailSubject: election.emailSubject,
      emailLogoUrl: election.emailLogoUrl,
      emailFooter: election.emailFooter,
      endsAt: election.endsAt?.toISOString(),
      results: { totalVoters: raw.totalVoters, votedCount: raw.votedCount, turnoutPct, questions },
    },
    "results"
  )

  if (error) {
    console.error("[results/email/test]", error)
    return NextResponse.json({ error: "Failed to send test email — check email settings" }, { status: 500 })
  }
  return NextResponse.json({ sent: true })
}
