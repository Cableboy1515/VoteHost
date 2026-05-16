import { redirect, notFound } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import { getResultsForElection } from "@/lib/results"
import ResultsDashboard from "@/components/admin/ResultsDashboard"
import EmailResultsButton from "@/components/admin/EmailResultsButton"
import ExportResultsButtons from "@/components/admin/ExportResultsButtons"
import ElectionTabs from "@/components/admin/ElectionTabs"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"
import type { ElectionStatus } from "@/lib/generated/prisma/client"

const STATUS_STYLE: Record<ElectionStatus, React.CSSProperties> = {
  DRAFT: { background: "var(--vh-surface-3)", color: "var(--vh-ink-soft)", borderColor: "var(--vh-line-strong)" },
  ACTIVE: { background: "var(--vh-success-soft)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.78 0.08 155)" },
  COMPLETED: { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)", borderColor: "oklch(0.85 0.05 255)" },
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) redirect("/login")

  const { id } = await params
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  const initialData = await getResultsForElection(id)

  const isViewer = session.role === "VIEWER"

  const ballotResetByEmail = election.ballotResetById
    ? (await db.adminUser.findUnique({ where: { id: election.ballotResetById }, select: { email: true } }))?.email ?? null
    : null
  const closedByEmail = election.closedById
    ? (await db.adminUser.findUnique({ where: { id: election.closedById }, select: { email: true } }))?.email ?? null
    : null

  return (
    <div className="p-4 sm:p-8 max-w-[1040px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        {isViewer ? (
          <GuardLink href="/elections">Elections</GuardLink>
        ) : (
          <>
            <GuardLink href="/dashboard">Elections</GuardLink>
            <span className="mx-1.5">›</span>
            <GuardLink href={`/elections/${id}`}>{election.title}</GuardLink>
          </>
        )}
      </div>
      {!isViewer && <ElectionTabs electionId={id} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium border"
              style={STATUS_STYLE[election.status]}
            >
              {election.status === "ACTIVE" && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: "oklch(0.55 0.13 155)", animation: "vhPulse 1.6s ease-in-out infinite" }}
                />
              )}
              {election.status === "ACTIVE" ? "Live" : election.status.charAt(0) + election.status.slice(1).toLowerCase()}
            </span>
            <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              {election.status === "ACTIVE" ? "· updated just now" : ""}
            </span>
          </div>
          <h1 className="text-[26px] font-semibold">{election.title}</h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          {!isViewer && (
            <EmailResultsButton
              electionId={id}
              status={election.status}
              resultsEmailSentAt={election.resultsEmailSentAt?.toISOString() ?? null}
            />
          )}
          {election.status === "COMPLETED" && (
            <ExportResultsButtons electionId={id} />
          )}
        </div>
      </div>

      {election.ballotResetAt && (
        <div
          className="mb-5 rounded-[12px] px-4 py-3 text-[13px]"
          style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)", color: "var(--vh-ink-soft)" }}
        >
          <strong>Note:</strong> This election&rsquo;s ballot was reset on{" "}
          {new Date(election.ballotResetAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {ballotResetByEmail ? ` by ${ballotResetByEmail}` : ""}. Earlier votes were discarded and voters were asked to recast their ballots.
        </div>
      )}
      {election.closedAt && (
        <div
          className="mb-5 rounded-[12px] px-4 py-3 text-[13px]"
          style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)", color: "var(--vh-ink-soft)" }}
        >
          <strong>Note:</strong> This election was closed early on{" "}
          {new Date(election.closedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          {closedByEmail ? ` by ${closedByEmail}` : ""}.
        </div>
      )}
      <ResultsDashboard
        electionId={id}
        initialData={initialData}
        endsAt={election.endsAt?.toISOString()}
        electionStatus={election.status}
      />
    </div>
  )
}
