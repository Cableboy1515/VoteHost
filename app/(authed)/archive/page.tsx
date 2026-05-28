export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import { autoCompleteElections } from "@/lib/autoCompleteElections"
import type { ElectionStatus } from "@/lib/generated/prisma/client"
import { formatDateOnlyInTz, getDisplayTimeZone } from "@/lib/timezone"

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

export default async function ArchivePage() {
  const session = await requireRole("ORGANIZER")
  if (!session) redirect("/elections")

  await autoCompleteElections()

  const [elections, tz] = await Promise.all([
    db.election.findMany({
      where: { archived: true },
      orderBy: { endsAt: "desc" },
      include: { _count: { select: { voters: true } } },
    }),
    getDisplayTimeZone(),
  ])

  const electionIds = elections.map((e) => e.id)
  const votedCountRows = electionIds.length > 0
    ? await db.voter.groupBy({
        by: ["electionId"],
        where: { electionId: { in: electionIds }, hasVoted: true },
        _count: { _all: true },
      })
    : []
  const votedByElection = new Map(votedCountRows.map((r) => [r.electionId, r._count._all]))

  const closerIds = [...new Set(elections.map((e) => e.closedById).filter(Boolean) as string[])]
  const closerRows = closerIds.length > 0
    ? await db.adminUser.findMany({ where: { id: { in: closerIds } }, select: { id: true, email: true } })
    : []
  const closerEmailById = new Map(closerRows.map((r) => [r.id, r.email]))

  const electionsWithStats = elections.map((e) => ({
    ...e,
    votedCount: votedByElection.get(e.id) ?? 0,
    closedByEmail: e.closedById ? (closerEmailById.get(e.closedById) ?? null) : null,
  }))

  // Group by close year (prefer closedAt, fall back to endsAt, then createdAt)
  const byYear = new Map<string, typeof electionsWithStats>()
  for (const e of electionsWithStats) {
    const year = String((e.closedAt ?? e.endsAt ?? e.createdAt).getFullYear())
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(e)
  }
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a))

  return (
    <div className="p-4 sm:p-8 max-w-[1040px]">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold mb-1">Archive</h1>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          Closed elections. Results stay accessible; ballots are deleted after 90 days.
        </p>
      </div>

      {electionsWithStats.length === 0 ? (
        <div
          className="rounded-[16px] py-14 text-center text-[14px]"
          style={{ border: "1px solid var(--vh-line)", color: "var(--vh-muted)" }}
        >
          No archived elections yet.
        </div>
      ) : (
        <div className="flex flex-col">
          {years.map((year) => (
            <div key={year}>
              <div
                className="px-1 py-2 text-[11.5px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--vh-muted)" }}
              >
                {year}
              </div>

              <div className="flex flex-col gap-2 mb-4">
                {byYear.get(year)!.map((e) => {
                  const turnoutPct = e._count.voters > 0
                    ? Math.round((e.votedCount / e._count.voters) * 100)
                    : 0
                  const closeDate = e.closedAt ?? e.endsAt ?? e.createdAt
                  const dateStr = formatDateOnlyInTz(closeDate, tz)

                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center gap-3 sm:gap-4 bg-vh-surface rounded-[12px] px-[18px] py-4"
                      style={{ border: "1px solid var(--vh-line)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[14.5px] font-medium truncate">{e.title}</div>
                        <div className="text-[12.5px] mt-0.5" style={{ color: "var(--vh-muted)" }}>
                          Closed {dateStr}
                          {e.closedByEmail && ` · by ${e.closedByEmail}`}
                        </div>
                      </div>

                      <div
                        className="text-[13px] whitespace-nowrap"
                        style={{ color: "var(--vh-ink-soft)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {e.votedCount}/{e._count.voters}
                        <span className="ml-1" style={{ color: "var(--vh-muted)" }}>
                          · {turnoutPct}%
                        </span>
                      </div>

                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border whitespace-nowrap"
                        style={STATUS_STYLE[e.status]}
                      >
                        {STATUS_LABEL[e.status]}
                      </span>

                      <div className="flex flex-wrap gap-1.5">
                        <Link
                          href={`/elections/${e.id}/results`}
                          className="px-3 py-1.5 rounded-[8px] text-[13px] transition-colors bg-vh-surface-2 hover:bg-vh-surface-3"
                          style={{ color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
                        >
                          Results →
                        </Link>
                        <ArchiveElectionButton id={e.id} archived={true} electionStatus={e.status} />
                        <DeleteElectionButton id={e.id} title={e.title} role={session.role} archived={true} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
