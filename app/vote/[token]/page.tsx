import { db } from "@/lib/db"
import ErrorScreen from "@/components/ballot/ErrorScreen"
import BallotForm from "@/components/ballot/BallotForm"

export default async function VotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const voter = await db.voter.findUnique({
    where: { token },
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
  if (voter.hasVoted) return <ErrorScreen type="already-voted" />

  const now = new Date()
  // Future start date — show "not-open" with the date, regardless of DRAFT/ACTIVE status.
  // (DRAFT + future startsAt is the pre-invitation case; voters got a save-the-date.)
  if (voter.election.startsAt && now < voter.election.startsAt) {
    return <ErrorScreen type="not-open" startsAt={voter.election.startsAt.toISOString()} />
  }
  if (voter.election.status !== "ACTIVE") return <ErrorScreen type="closed" />
  if (voter.election.endsAt && now > voter.election.endsAt) return <ErrorScreen type="closed" />

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
