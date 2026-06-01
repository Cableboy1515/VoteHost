import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import VoterManager from "@/components/admin/VoterManager"
import ElectionTabs from "@/components/admin/ElectionTabs"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"

export default async function VotersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireRole("ORGANIZER")
  if (!session) redirect(`/elections/${id}/results`)

  const election = await db.election.findUnique({
    where: { id },
    include: {
      voters: { orderBy: { name: "asc" } },
      _count: { select: { questions: true } },
    },
  })
  if (!election) notFound()

  return (
    <div className="p-4 sm:p-8 max-w-[1040px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/dashboard">Elections</GuardLink>
        <span className="mx-1.5">›</span>
        <GuardLink href={`/elections/${id}`}>{election.title}</GuardLink>
      </div>
      <ElectionTabs electionId={id} />
      <div className="mb-5">
        <h1 className="text-[26px] font-semibold mb-1">Voters</h1>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          {election.title} · {election.voters.length} voter{election.voters.length !== 1 ? "s" : ""}
        </p>
      </div>
      <VoterManager
        electionId={id}
        electionStatus={election.status}
        electionStartsAt={election.startsAt?.toISOString() ?? null}
        electionAutoActivate={election.autoActivate}
        electionTitle={election.title}
        questionCount={election._count.questions}
        weightingEnabled={election.weightingEnabled}
        initialVoters={election.voters.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          weight: v.weight,
          hasVoted: v.hasVoted,
          invitedAt: v.invitedAt?.toISOString() ?? null,
          votedAt: v.votedAt?.toISOString() ?? null,
          lastSendStatus: v.lastSendStatus ?? null,
          lastSendErrorCode: v.lastSendErrorCode ?? null,
          lastSendErrorMessage: v.lastSendErrorMessage ?? null,
          lastSendAttemptAt: v.lastSendAttemptAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
