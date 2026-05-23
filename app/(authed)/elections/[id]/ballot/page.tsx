import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import BallotBuilder from "@/components/admin/BallotBuilder"
import BallotLockBanner from "@/components/admin/BallotLockBanner"
import ElectionTabs from "@/components/admin/ElectionTabs"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"

export default async function BallotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireRole("ORGANIZER")
  if (!session) redirect(`/elections/${id}/results`)

  const election = await db.election.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      firstVoteAt: true,
      ballotResetAt: true,
      ballotResetById: true,
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!election) notFound()

  const resetByEmail = election.ballotResetById
    ? (await db.adminUser.findUnique({ where: { id: election.ballotResetById }, select: { email: true } }))?.email ?? null
    : null

  return (
    <div className="p-4 sm:p-8 max-w-[720px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/dashboard">Elections</GuardLink>
        <span className="mx-1.5">›</span>
        <GuardLink href={`/elections/${id}`}>{election.title}</GuardLink>
      </div>
      <ElectionTabs electionId={id} />
      <BallotLockBanner
        firstVoteAt={election.firstVoteAt?.toISOString() ?? null}
        ballotResetAt={election.ballotResetAt?.toISOString() ?? null}
        ballotResetByEmail={resetByEmail}
        electionStatus={election.status}
      />
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold mb-1">Ballot Builder</h1>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          {election.questions.length} question{election.questions.length !== 1 ? "s" : ""}
        </p>
      </div>
      <BallotBuilder
        electionId={id}
        electionStatus={election.status}
        firstVoteAt={election.firstVoteAt?.toISOString() ?? null}
        initialQuestions={election.questions.map((q) => ({
          id: q.id,
          text: q.text,
          description: q.description ?? undefined,
          type: q.type,
          order: q.order,
          required: q.required,
          maxSelections: q.maxSelections ?? undefined,
          randomizeOptions: q.randomizeOptions,
          showOptionAvatars: q.showOptionAvatars,
          options: q.options.map((o) => ({
            id: o.id,
            text: o.text,
            order: o.order,
            bio: o.bio ?? undefined,
            photoUrl: o.photoUrl ?? undefined,
            photoDeleteUrl: o.photoDeleteUrl ?? undefined,
            website: o.website ?? undefined,
          })),
        }))}
      />
    </div>
  )
}
