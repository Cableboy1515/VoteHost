import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import ElectionTabs from "@/components/admin/ElectionTabs"
import ActivityLogTable from "@/components/admin/ActivityLogTable"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"

export default async function ElectionActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireRole("ORGANIZER")
  if (!session) redirect(`/elections/${id}/results`)

  const election = await db.election.findUnique({ where: { id }, select: { title: true } })
  if (!election) notFound()

  return (
    <div className="p-4 sm:p-8 max-w-[1040px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/dashboard">Elections</GuardLink>
        <span className="mx-1.5">›</span>
        <GuardLink href={`/elections/${id}`}>{election.title}</GuardLink>
      </div>
      <ElectionTabs electionId={id} />
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold mb-1">Activity</h1>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          Audit log of admin actions for {election.title}.
        </p>
      </div>
      <ActivityLogTable apiUrl={`/api/elections/${id}/activity`} scope="election" />
    </div>
  )
}
