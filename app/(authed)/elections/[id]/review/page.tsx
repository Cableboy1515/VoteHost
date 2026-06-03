import { redirect, notFound } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import WriteInReviewPanel from "@/components/admin/WriteInReviewPanel"

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireRole("ADMIN")
  if (!session) redirect("/login")

  const election = await db.election.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, autoSendResults: true },
  })
  if (!election) notFound()

  // This page is only meaningful while the election is pending review.
  // Redirect to results if already finalized, or back to settings if not yet in review.
  if (election.status === "COMPLETED") redirect(`/elections/${id}/results`)
  if (election.status !== "PENDING_REVIEW") redirect(`/elections/${id}`)

  // Load write-in-enabled questions with their raw responses, existing merges, and
  // pre-listed options (used by the UI to flag when a canonical label matches a listed candidate).
  const questions = await db.question.findMany({
    where: { electionId: id, allowWriteIn: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      text: true,
      options: { select: { id: true, text: true }, orderBy: { order: "asc" } },
    },
  })

  const merges = await db.writeInMerge.findMany({
    where: { electionId: id },
    select: { questionId: true, rawText: true, canonicalLabel: true },
  })
  const mergeIndex = new Map(merges.map((m) => [`${m.questionId}:::${m.rawText}`, m.canonicalLabel]))

  const writeInVotes = await db.vote.findMany({
    where: { electionId: id, optionId: null, writeInText: { not: null } },
    select: { questionId: true, writeInText: true },
  })

  const responsesByQuestion = new Map<string, Map<string, number>>()
  for (const v of writeInVotes) {
    if (!v.writeInText) continue
    if (!responsesByQuestion.has(v.questionId)) responsesByQuestion.set(v.questionId, new Map())
    const qMap = responsesByQuestion.get(v.questionId)!
    qMap.set(v.writeInText, (qMap.get(v.writeInText) ?? 0) + 1)
  }

  const questionData = questions.map((q) => {
    const rawCounts = responsesByQuestion.get(q.id) ?? new Map<string, number>()
    const entries = [...rawCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([rawText, count]) => ({
        rawText,
        count,
        canonicalLabel: mergeIndex.get(`${q.id}:::${rawText}`) ?? null,
      }))
    return {
      questionId: q.id,
      questionText: q.text,
      totalResponses: [...rawCounts.values()].reduce((s, c) => s + c, 0),
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      entries,
    }
  })

  return (
    <div className="p-4 sm:p-8 max-w-[720px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <a href="/dashboard" className="hover:underline">Elections</a>
        <span className="mx-1.5">›</span>
        <a href={`/elections/${id}`} className="hover:underline">{election.title}</a>
        <span className="mx-1.5">›</span>
        Write-in Review
      </div>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[26px] font-semibold">Write-in Review</h1>
          <span
            className="text-[11.5px] uppercase tracking-wide px-2.5 py-1 rounded-full font-medium"
            style={{ background: "oklch(0.93 0.06 255)", color: "oklch(0.4 0.15 255)" }}
          >
            Pending review
          </span>
        </div>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          Voting has closed. Review write-in responses below, merge spelling variants if needed,
          then finalize to seal the tally and publish results.
        </p>
      </div>

      <WriteInReviewPanel
        electionId={id}
        questions={questionData}
        autoSendResults={election.autoSendResults}
      />
    </div>
  )
}
