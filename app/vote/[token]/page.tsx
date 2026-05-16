import { db } from "@/lib/db"
import ErrorScreen from "@/components/ballot/ErrorScreen"
import BallotForm from "@/components/ballot/BallotForm"

export default async function VotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  // Phase 1: lightweight check — skips the questions/options join for invalid or
  // closed-election tokens (the common case for stale magic links in old emails).
  const quick = await db.voter.findUnique({
    where: { token },
    select: {
      id: true,
      hasVoted: true,
      election: { select: { status: true, startsAt: true, endsAt: true } },
    },
  })

  if (!quick) return <ErrorScreen type="invalid" />
  if (quick.hasVoted) return <ErrorScreen type="already-voted" />

  const now = new Date()
  // Future startsAt (DRAFT or ACTIVE) → save-the-date with concrete open date.
  if (quick.election.startsAt && now < quick.election.startsAt) {
    return <ErrorScreen type="not-open" startsAt={quick.election.startsAt.toISOString()} />
  }
  // DRAFT with no startsAt, or past startsAt the organizer hasn't activated yet.
  if (quick.election.status === "DRAFT") return <ErrorScreen type="draft-pending" />
  // Genuinely finished (COMPLETED or CLOSED), or ACTIVE but past endsAt.
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
