export const dynamic = "force-dynamic"

import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import ElectionForm from "@/components/admin/ElectionForm"
import ElectionTabs from "@/components/admin/ElectionTabs"
import BallotLockBanner from "@/components/admin/BallotLockBanner"
import FullTurnoutBanner from "@/components/admin/FullTurnoutBanner"
import DiscardBallotButton from "@/components/admin/DiscardBallotButton"
import PurgeImagesButton from "@/components/admin/PurgeImagesButton"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import CloseElectionEarlyButton from "@/components/admin/CloseElectionEarlyButton"
import CancelActivationButton from "@/components/admin/CancelActivationButton"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

export default async function EditElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  const { id } = await params
  if (!session) redirect(`/elections/${id}/results`)

  await autoCompleteElections()
  const election = await db.election.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          voters: { where: { hasVoted: true } },
          questions: true,
        },
      },
      voters: { select: { invitedAt: true } },
    },
  })
  if (!election) notFound()

  const isClosed = election.status === "COMPLETED"
  const isPendingReview = election.status === "PENDING_REVIEW"
  const canDiscard = !!election.firstVoteAt && election.status !== "COMPLETED" && !isPendingReview
  const votedCount = election._count.voters
  const totalVoterCount = election.voters.length
  const invitedCount = election.voters.filter((v) => v.invitedAt !== null).length
  const uninvitedCount = totalVoterCount - invitedCount

  const resetByEmail = election.ballotResetById
    ? (await db.adminUser.findUnique({ where: { id: election.ballotResetById }, select: { email: true } }))?.email ?? null
    : null
  const closedByEmail = election.closedById
    ? (await db.adminUser.findUnique({ where: { id: election.closedById }, select: { email: true } }))?.email ?? null
    : null
  const reopenedByEmail = election.reopenedById
    ? (await db.adminUser.findUnique({ where: { id: election.reopenedById }, select: { email: true } }))?.email ?? null
    : null

  return (
    <div className="p-4 sm:p-8 max-w-[800px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/dashboard">Elections</GuardLink>
        <span className="mx-1.5">›</span>
        <span>{election.title}</span>
      </div>
      <ElectionTabs electionId={id} />
      <BallotLockBanner
        firstVoteAt={election.firstVoteAt?.toISOString() ?? null}
        ballotResetAt={election.ballotResetAt?.toISOString() ?? null}
        ballotResetByEmail={resetByEmail}
        reopenedAt={election.reopenedAt?.toISOString() ?? null}
        reopenedByEmail={reopenedByEmail}
        electionStatus={election.status}
        onSettingsTab
      />
      <FullTurnoutBanner
        electionId={id}
        electionTitle={election.title}
        votedCount={votedCount}
        invitedCount={invitedCount}
        status={election.status}
        endsAt={election.endsAt?.toISOString() ?? null}
      />
      <h1 className="text-[26px] font-semibold mb-5">Settings</h1>
      <ElectionForm
        key={election.status}
        electionId={election.id}
        closedAt={election.closedAt?.toISOString() ?? null}
        closedByEmail={closedByEmail}
        questionCount={election._count.questions}
        voterCount={totalVoterCount}
        uninvitedCount={uninvitedCount}
        initialValues={{
          title: election.title,
          description: election.description,
          status: election.status,
          startsAt: election.startsAt?.toISOString(),
          endsAt: election.endsAt?.toISOString(),
          emailSubject: election.emailSubject,
          emailMessage: election.emailMessage,
          emailLogoUrl: election.emailLogoUrl,
          emailLogoDeleteUrl: election.emailLogoDeleteUrl,
          emailFooter: election.emailFooter,
          firstReminderDays: election.firstReminderDays,
          autoActivate: election.autoActivate,
          autoSendResults: election.autoSendResults,
          resultsEmailSentAt: election.resultsEmailSentAt?.toISOString() ?? null,
          firstVoteAt: election.firstVoteAt?.toISOString() ?? null,
          weightingEnabled: election.weightingEnabled,
          quorumType: election.quorumType,
          quorumValue: election.quorumValue,
        }}
      />
      {isPendingReview && (
        <div
          className="mt-6 rounded-[14px] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{ background: "oklch(0.96 0.06 75)", border: "1px solid oklch(0.82 0.10 75)" }}
        >
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "oklch(0.4 0.14 65)" }}>
              Write-in review required
            </p>
            <p className="text-[13px]" style={{ color: "oklch(0.5 0.10 65)" }}>
              Voting has closed. Review and merge write-in responses before the tally is sealed.
            </p>
          </div>
          <a
            href={`/elections/${id}/review`}
            className="flex-shrink-0 px-4 py-2.5 rounded-[10px] text-[13.5px] font-semibold transition-colors"
            style={{ background: "oklch(0.55 0.14 65)", color: "white" }}
          >
            Review write-ins →
          </a>
        </div>
      )}
      {isClosed && (
        <PurgeImagesButton
          electionId={id}
          purgedAt={election.imagesPurgedAt?.toISOString() ?? null}
        />
      )}
      <div
        className="mt-8 rounded-[14px] p-5"
        style={{ border: "1px solid var(--vh-danger)", background: "var(--vh-danger-soft, #fef2f2)" }}
      >
        <h2 className="text-[15px] font-semibold mb-1" style={{ color: "var(--vh-danger)" }}>Danger zone</h2>
        <p className="text-[13px] mb-4" style={{ color: "var(--vh-muted)" }}>These actions are permanent and cannot be undone.</p>
        <div className="flex flex-wrap gap-3">
          {election.status === "ACTIVE" && !election.firstVoteAt && (
            <CancelActivationButton electionId={id} electionTitle={election.title} />
          )}
          {election.status === "ACTIVE" && !isPendingReview && (
            <CloseElectionEarlyButton id={id} title={election.title} variant="danger" />
          )}
          {canDiscard && (
            <DiscardBallotButton electionId={id} electionTitle={election.title} votedCount={election._count.voters} />
          )}
          <DeleteElectionButton id={id} title={election.title} role={session.role} archived={election.archived} status={election.status} />
        </div>
      </div>
    </div>
  )
}
