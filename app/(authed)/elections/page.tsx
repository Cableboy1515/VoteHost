export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import type { ElectionStatus } from "@/lib/generated/prisma/client"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

type FilterKey = "all" | "active" | "draft" | "completed"

const STATUS_LABEL: Record<ElectionStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  COMPLETED: "Completed",
}

const STATUS_STYLE: Record<ElectionStatus, React.CSSProperties> = {
  DRAFT: { background: "var(--vh-surface-3)", color: "var(--vh-ink-soft)", borderColor: "var(--vh-line-strong)" },
  ACTIVE: { background: "var(--vh-success-soft)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.78 0.08 155)" },
  COMPLETED: { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)", borderColor: "oklch(0.85 0.05 255)" },
}

function StatusBadge({ status }: { status: ElectionStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11.5px] font-medium border"
      style={STATUS_STYLE[status]}
    >
      {status === "ACTIVE" && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "oklch(0.55 0.13 155)" }} />
      )}
      {STATUS_LABEL[status]}
    </span>
  )
}

const FILTER_TABS: { key: FilterKey; label: string; status?: ElectionStatus }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active", status: "ACTIVE" },
  { key: "draft", label: "Drafts", status: "DRAFT" },
  { key: "completed", label: "Completed", status: "COMPLETED" },
]

export default async function ElectionsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const session = await requireRole("VIEWER")
  if (!session) redirect("/login")

  await autoCompleteElections()

  // Viewer-only surface: results for active/completed/closed elections
  if (session.role === "VIEWER") {
    const elections = await db.election.findMany({
      where: { archived: false, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { voters: true } } },
    })

    if (elections.length === 1) {
      redirect(`/elections/${elections[0].id}/results`)
    }

    return (
      <div className="p-4 sm:p-8 max-w-[1100px]">
        <div className="mb-6">
          <h1 className="text-[28px] font-semibold mb-1">Elections</h1>
          <p className="text-[14.5px]" style={{ color: "var(--vh-muted)" }}>
            {elections.length} election{elections.length !== 1 ? "s" : ""}
          </p>
        </div>

        {elections.length === 0 ? (
          <div
            className="bg-vh-surface rounded-[14px] p-10 text-center"
            style={{ border: "1px solid var(--vh-line)" }}
          >
            <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
              No elections to view yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {elections.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 sm:gap-4 bg-vh-surface rounded-[14px] px-4 sm:px-5 py-4"
                style={{ border: "1px solid var(--vh-line)" }}
              >
                <StatusBadge status={e.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium truncate">{e.title}</div>
                  {e.endsAt && (
                    <div className="text-[12.5px] mt-0.5" style={{ color: "var(--vh-muted)" }}>
                      {e.status === "ACTIVE"
                        ? `Closes ${e.endsAt.toLocaleDateString()}`
                        : `Ended ${e.endsAt.toLocaleDateString()}`}
                    </div>
                  )}
                </div>
                <Link
                  href={`/elections/${e.id}/results`}
                  className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors bg-vh-surface-2 hover:bg-vh-surface-3"
                  style={{ color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
                >
                  View results →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Organizer / Admin full view
  const sp = await searchParams
  const filterKey = (FILTER_TABS.find((t) => t.key === sp.status)?.key ?? "all") as FilterKey
  const filterStatus = FILTER_TABS.find((t) => t.key === filterKey)?.status

  const elections = await db.election.findMany({
    where: { archived: false, ...(filterStatus ? { status: filterStatus } : {}) },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { voters: true } } },
  })

  const statusCounts = await db.election.groupBy({
    by: ["status"],
    where: { archived: false },
    _count: { _all: true },
  })

  const electionIds = elections.map((e) => e.id)
  const votedCountRows = electionIds.length > 0
    ? await db.voter.groupBy({
        by: ["electionId"],
        where: { electionId: { in: electionIds }, hasVoted: true },
        _count: { _all: true },
      })
    : []
  const votedByElection = new Map(votedCountRows.map((r) => [r.electionId, r._count._all]))

  const electionsWithStats = elections.map((e) => ({
    ...e,
    votedCount: votedByElection.get(e.id) ?? 0,
  }))

  const totalNonArchived = statusCounts.reduce((sum, s) => sum + s._count._all, 0)
  const countByKey: Record<FilterKey, number> = {
    all: totalNonArchived,
    active: statusCounts.find((s) => s.status === "ACTIVE")?._count._all ?? 0,
    draft: statusCounts.find((s) => s.status === "DRAFT")?._count._all ?? 0,
    completed: statusCounts.find((s) => s.status === "COMPLETED")?._count._all ?? 0,
  }

  return (
    <div className="p-4 sm:p-8 max-w-[1100px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div>
          <h1 className="text-[28px] font-semibold mb-1">Elections</h1>
          <p className="text-[14.5px]" style={{ color: "var(--vh-muted)" }}>
            {totalNonArchived} election{totalNonArchived !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link
          href="/elections/new"
          className="inline-flex items-center justify-center px-5 py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors bg-vh-accent hover:bg-vh-accent-strong"
        >
          + New election
        </Link>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTER_TABS.map((tab) => {
          const active = tab.key === filterKey
          const count = countByKey[tab.key]
          return (
            <Link
              key={tab.key}
              href={tab.key === "all" ? "/elections" : `/elections?status=${tab.key}`}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${active ? "bg-vh-accent text-white hover:opacity-90" : "bg-vh-surface hover:bg-vh-surface-2"}`}
              style={{
                color: active ? undefined : "var(--vh-ink-soft)",
                border: `1px solid ${active ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
              }}
            >
              {tab.label}
              <span
                className="text-[11.5px] tabular-nums"
                style={{ opacity: active ? 0.85 : 0.7 }}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      {electionsWithStats.length === 0 ? (
        <div
          className="bg-vh-surface rounded-[14px] p-10 text-center"
          style={{ border: "1px solid var(--vh-line)" }}
        >
          <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
            No elections in this view.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {electionsWithStats.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 sm:gap-4 bg-vh-surface rounded-[14px] px-4 sm:px-5 py-4"
              style={{ border: "1px solid var(--vh-line)" }}
            >
              <StatusBadge status={e.status} />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium truncate">{e.title}</div>
                {e.endsAt && (
                  <div className="text-[12.5px] mt-0.5" style={{ color: "var(--vh-muted)" }}>
                    {e.status === "ACTIVE"
                      ? `Closes ${e.endsAt.toLocaleDateString()}`
                      : `Ended ${e.endsAt.toLocaleDateString()}`}
                  </div>
                )}
              </div>
              {e._count.voters > 0 && (
                <div className="text-[13px] tabular-nums" style={{ color: "var(--vh-ink-soft)" }}>
                  {e.votedCount}/{e._count.voters}
                  <span className="ml-1 font-semibold">
                    {Math.round((e.votedCount / e._count.voters) * 100)}%
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href={`/elections/${e.id}`}
                  className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors bg-vh-surface-2 hover:bg-vh-surface-3"
                  style={{ color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
                >
                  Edit
                </Link>
                <Link
                  href={`/elections/${e.id}/voters`}
                  className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors bg-vh-surface-2 hover:bg-vh-surface-3"
                  style={{ color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
                >
                  Voters
                </Link>
                <Link
                  href={`/elections/${e.id}/results`}
                  className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors bg-vh-surface-2 hover:bg-vh-surface-3"
                  style={{ color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
                >
                  Results
                </Link>
                <ArchiveElectionButton id={e.id} archived={false} />
                <DeleteElectionButton id={e.id} title={e.title} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
