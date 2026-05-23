import { db } from "@/lib/db"
import ErrorScreen from "@/components/ballot/ErrorScreen"
import BallotForm from "@/components/ballot/BallotForm"
import { canActivate } from "@/lib/canActivate"
import { hashVoterToken } from "@/lib/voterToken"
import { getDisplayTimeZone } from "@/lib/timezone"

export default async function VotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Phase 1: lightweight check — skips the questions/options join for invalid or
  // closed-election tokens (the common case for stale magic links in old emails).
  const [quick, tz] = await Promise.all([
  db.voter.findUnique({
    where: { tokenHash: hashVoterToken(token) },
    select: {
      id: true,
      hasVoted: true,
      election: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          autoActivate: true,
          _count: { select: { questions: true, voters: true } },
        },
      },
    },
  }),
  getDisplayTimeZone(),
  ])

  if (!quick) return <ErrorScreen type="invalid" />
  if (quick.hasVoted) return <ErrorScreen type="already-voted" />

  const now = new Date()

  // Lazy auto-activation safety net: if cron hasn't ticked yet but startsAt has passed.
  if (
    quick.election.status === "DRAFT" &&
    quick.election.autoActivate &&
    quick.election.startsAt &&
    quick.election.startsAt <= now
  ) {
    const check = canActivate({
      questionCount: quick.election._count.questions,
      voterCount: quick.election._count.voters,
      endsAt: quick.election.endsAt,
    })
    if (check.ok) {
      await db.election.update({
        where: { id: quick.election.id },
        data: { status: "ACTIVE", activatedAt: quick.election.startsAt, activatedById: null },
      })
      // Re-read with updated status by falling through — treat as ACTIVE below.
      quick.election.status = "ACTIVE"
    }
  }

  // Future startsAt (DRAFT or ACTIVE) → save-the-date with concrete open date.
  if (quick.election.startsAt && now < quick.election.startsAt) {
    return <ErrorScreen type="not-open" startsAt={quick.election.startsAt.toISOString()} timeZone={tz} />
  }
  // DRAFT with no startsAt, or past startsAt the organizer hasn't activated yet.
  if (quick.election.status === "DRAFT") return <ErrorScreen type="draft-pending" />
  // Genuinely finished (COMPLETED), or ACTIVE but past endsAt.
  if (quick.election.status !== "ACTIVE") return <ErrorScreen type="closed" />
  if (quick.election.endsAt && now > quick.election.endsAt) return <ErrorScreen type="closed" />

  // Phase 2: active election and voter hasn't voted — load the full ballot.
  const voter = await db.voter.findUnique({
    where: { id: quick.id },
    include: {
      election: {
        include: {
          questions: {
            include: { options: { orderBy: { order: "asc" } } },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  })

  if (!voter) return <ErrorScreen type="invalid" />

  return (
    <BallotForm
      token={token}
      electionTitle={voter.election.title}
      electionDescription={voter.election.description ?? undefined}
      questions={voter.election.questions.map((q) => ({
        id: q.id,
        text: q.text,
        description: q.description ?? undefined,
        type: q.type as "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN",
        required: q.required,
        maxSelections: q.maxSelections ?? undefined,
        randomizeOptions: q.randomizeOptions,
        showOptionAvatars: q.showOptionAvatars,
        options: q.options.map((o) => ({
          id: o.id,
          text: o.text,
          bio: o.bio ?? undefined,
          photoUrl: o.photoUrl ?? undefined,
          website: o.website ?? undefined,
        })),
      }))}
    />
  )
}
