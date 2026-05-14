export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import ReopenElectionButton from "@/components/admin/ReopenElectionButton"
import { autoCompleteElections } from "@/lib/autoCompleteElections"
import type { ElectionStatus } from "@/lib/generated/prisma/client"

const STATUS_LABEL: Record<ElectionStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  CLOSED: "Closed",
  COMPLETED: "Completed",
}

const STATUS_STYLE: Record<ElectionStatus, React.CSSProperties> = {
  DRAFT: { background: "var(--vh-surface-3)", color: "var(--vh-ink-soft)", borderColor: "var(--vh-line-strong)" },
  ACTIVE: { background: "var(--vh-success-soft)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.78 0.08 155)" },
  CLOSED: { background: "var(--vh-surface-3)", color: "var(--vh-muted)", borderColor: "var(--vh-line-strong)" },
  COMPLETED: { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)", borderColor: "oklch(0.85 0.05 255)" },
}

export default async function ArchivePage() {
  await autoCompleteElections()

  const elections = await db.election.findMany({
    where: { archived: true },
    orderBy: { endsAt: "desc" },
    include: { _count: { select: { voters: true } } },
  })

  const electionsWithStats = await Promise.all(
    elections.map(async (e) => ({
      ...e,
      votedCount: await db.voter.count({ where: { electionId: e.id, hasVoted: true } }),
    }))
  )

  // Group by close year (fall back to createdAt year)
  const byYear = new Map<string, typeof electionsWithStats>()
  for (const e of electionsWithStats) {
    const year = String((e.endsAt ?? e.createdAt).getFullYear())
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
              {/* Year eyebrow */}
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
                  const dateStr = e.endsAt
                    ? e.endsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

                  return (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-center gap-3 sm:gap-4 bg-vh-surface rounded-[12px] px-[18px] py-4"
                      style={{ border: "1px solid var(--vh-line)" }}
                    >
                      {/* Title + date */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[14.5px] font-medium truncate">{e.title}</div>
                        <div className="text-[12.5px] mt-0.5" style={{ color: "var(--vh-muted)" }}>
                          Closed {dateStr}
                        </div>
                      </div>

                      {/* Turnout */}
                      <div
                        className="text-[13px] whitespace-nowrap"
                        style={{ color: "var(--vh-ink-soft)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {e.votedCount}/{e._count.voters}
                        <span className="ml-1" style={{ color: "var(--vh-muted)" }}>
                          · {turnoutPct}%
                        </span>
                      </div>

                      {/* Status badge */}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11.5px] font-medium border whitespace-nowrap"
                        style={STATUS_STYLE[e.status]}
                      >
                        {STATUS_LABEL[e.status]}
                      </span>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-1.5">
                        <Link
                          href={`/admin/elections/${e.id}/results`}
                          className="px-3 py-1.5 rounded-[8px] text-[13px] transition-colors"
                          style={{ color: "var(--vh-ink-soft)", background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
                        >
                          Results →
                        </Link>
                        {e.status === "COMPLETED" && <ReopenElectionButton id={e.id} />}
                        <ArchiveElectionButton id={e.id} archived={true} />
                        <DeleteElectionButton id={e.id} title={e.title} />
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
