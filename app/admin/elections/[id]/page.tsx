export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import ElectionForm from "@/components/admin/ElectionForm"
import ElectionTabs from "@/components/admin/ElectionTabs"
import PurgeImagesButton from "@/components/admin/PurgeImagesButton"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

export default async function EditElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await autoCompleteElections()
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  const isClosed = election.status === "CLOSED" || election.status === "COMPLETED"

  return (
    <div className="p-4 sm:p-8 max-w-[800px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/admin/dashboard">Elections</GuardLink>
        <span className="mx-1.5">›</span>
        <span>{election.title}</span>
      </div>
      <ElectionTabs electionId={id} />
      <h1 className="text-[26px] font-semibold mb-5">Settings</h1>
      <ElectionForm
        electionId={election.id}
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
        }}
      />
      {isClosed && (
        <PurgeImagesButton
          electionId={id}
          purgedAt={election.imagesPurgedAt?.toISOString() ?? null}
        />
      )}
    </div>
  )
}
