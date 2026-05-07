export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import ElectionForm from "@/components/admin/ElectionForm"
import ElectionTestEmailButton from "@/components/admin/ElectionTestEmailButton"
import Link from "next/link"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

export default async function EditElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await autoCompleteElections()
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  return (
    <div className="p-8 max-w-[800px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <Link href="/admin/dashboard">Elections</Link>
        <span className="mx-1.5">›</span>
        <span>{election.title}</span>
      </div>
      <div className="flex items-end justify-between mb-5">
        <h1 className="text-[26px] font-semibold">Edit election</h1>
        <div className="flex gap-2">
          <ElectionTestEmailButton electionId={id} />
          <Link
            href={`/admin/elections/${id}/voters`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Voters
          </Link>
          <Link
            href={`/admin/elections/${id}/results`}
            className="px-3.5 py-2 rounded-[10px] text-[13px] transition-colors"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            Results
          </Link>
        </div>
      </div>
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
          emailFooter: election.emailFooter,
          firstReminderDays: election.firstReminderDays,
        }}
      />
    </div>
  )
}
