export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import type { ElectionStatus } from "@/lib/generated/prisma/client"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import ReopenElectionButton from "@/components/admin/ReopenElectionButton"
import { DashboardEmpty } from "@/components/admin/DashboardEmpty"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

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

function formatTimeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now()
  if (ms <= 0) return "Closing soon"
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  if (d >= 2) return `${d}d left`
  if (h >= 1) return `${h}h left`
  return "< 1h left"
}

export default async function DashboardPage() {
  await autoCompleteElections()

  const elections = await db.election.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { voters: true } } },
  })

  const electionsWithStats = await Promise.all(
    elections.map(async (e) => ({
      ...e,
      votedCount: await db.voter.count({ where: { electionId: e.id, hasVoted: true } }),
    }))
  )

  const activeElection = electionsWithStats.find((e) => e.status === "ACTIVE") ?? null
  const otherElections = electionsWithStats.filter((e) => e !== activeElection)

  const totalVoters = electionsWithStats.reduce((sum, e) => sum + e._count.voters, 0)
  const totalVoted = electionsWithStats.reduce((sum, e) => sum + e.votedCount, 0)
  const draftCount = electionsWithStats.filter((e) => e.status === "DRAFT").length

  const activeParticipation =
    activeElection && activeElection._count.voters > 0
      ? Math.round((activeElection.votedCount / activeElection._count.voters) * 100)
      : 0

  return (
    <div className="p-8 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="text-[28px] font-semibold mb-1">Elections</h1>
          <p className="text-[14.5px]" style={{ color: "var(--vh-muted)" }}>
            {activeElection
              ? `1 active election · ${totalVoted} vote${totalVoted !== 1 ? "s" : ""} cast`
              : `${elections.length} election${elections.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <Link
          href="/admin/elections/new"
          className="inline-flex items-center justify-center px-5 py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors"
          style={{ background: "var(--vh-accent)" }}
        >
          + New election
        </Link>
      </div>

      {elections.length === 0 ? (
        <DashboardEmpty />
      ) : (
        <>
          {/* Hero tile — active election */}
          {activeElection && (
            <div
              className="relative rounded-[18px] p-7 text-white overflow-hidden mb-4"
              style={{
                background: "linear-gradient(135deg, var(--vh-accent) 0%, var(--vh-accent-strong) 100%)",
                boxShadow: "var(--vh-shadow-md)",
              }}
            >
              {/* Decorative ring */}
              <div
                className="absolute pointer-events-none"
                style={{
                  top: -60, right: -60, width: 240, height: 240,
                  borderRadius: "50%", background: "rgba(255,255,255,0.06)",
                }}
              />
              <div className="relative">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: "oklch(0.85 0.18 145)",
                      animation: "vhPulse 1.6s ease-in-out infinite",
                    }}
                  />
                  <span className="text-[11.5px] tracking-widest opacity-85 uppercase">
                    Election in progress
                  </span>
                </div>
                <h2 className="text-2xl font-semibold mb-4" style={{ color: "white" }}>
                  {activeElection.title}
                </h2>
                <div className="flex items-end gap-8">
                  <div>
                    <div
                      className="text-[44px] font-semibold leading-none"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {activeParticipation}%
                    </div>
                    <div className="text-[13px] opacity-80 mt-1">
                      {activeElection.votedCount} of {activeElection._count.voters} voted
                    </div>
                  </div>
                  {activeElection.endsAt && (
                    <div>
                      <div className="text-[28px] font-medium leading-none">
                        {formatTimeLeft(activeElection.endsAt)}
                      </div>
                      <div className="text-[13px] opacity-80 mt-1">until close</div>
                    </div>
                  )}
                  <div className="flex-1 flex justify-end gap-2">
                    <Link
                      href={`/admin/elections/${activeElection.id}/voters`}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-[10px] text-sm transition-colors"
                      style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)" }}
                    >
                      Voters
                    </Link>
                    <Link
                      href={`/admin/elections/${activeElection.id}/results`}
                      className="inline-flex items-center justify-center px-4 py-2 rounded-[10px] text-sm font-semibold transition-colors"
                      style={{ background: "white", color: "var(--vh-accent-strong)" }}
                    >
                      View live results →
                    </Link>
                  </div>
                </div>
                {activeElection._count.voters > 0 && (
                  <div
                    className="mt-5 h-1 rounded-full overflow-hidden"
                    style={{ background: "rgba(255,255,255,0.18)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${activeParticipation}%`, background: "white", transition: "width 240ms ease" }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KPI tiles */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Total elections", value: String(elections.length), note: `${draftCount} draft` },
              { label: "Votes cast", value: String(totalVoted), note: "Across all elections" },
              { label: "Total voters", value: String(totalVoters), note: "Across all elections" },
            ].map((tile) => (
              <div
                key={tile.label}
                className="bg-vh-surface rounded-[14px] p-[18px]"
                style={{ border: "1px solid var(--vh-line)", boxShadow: "var(--vh-shadow-xs)" }}
              >
                <div className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>{tile.label}</div>
                <div
                  className="text-[26px] font-semibold mt-1.5"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {tile.value}
                </div>
                <div className="text-[12.5px] mt-1" style={{ color: "var(--vh-muted)" }}>{tile.note}</div>
              </div>
            ))}
          </div>

          {/* Other elections list */}
          {otherElections.length > 0 && (
            <>
              <h3 className="text-[17px] font-semibold mb-3.5 mt-2">
                {activeElection ? "Other elections" : "All elections"}
              </h3>
              <div className="flex flex-col gap-2.5">
                {otherElections.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-4 bg-vh-surface rounded-[14px] px-5 py-4"
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
                      <div
                        className="text-[13px] tabular-nums"
                        style={{ color: "var(--vh-ink-soft)" }}
                      >
                        {e.votedCount}/{e._count.voters}
                        <span className="ml-1 font-semibold">
                          {Math.round((e.votedCount / e._count.voters) * 100)}%
                        </span>
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <Link
                        href={`/admin/elections/${e.id}`}
                        className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors"
                        style={{ color: "var(--vh-ink-soft)", background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/elections/${e.id}/voters`}
                        className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors"
                        style={{ color: "var(--vh-ink-soft)", background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
                      >
                        Voters
                      </Link>
                      <Link
                        href={`/admin/elections/${e.id}/results`}
                        className="px-3 py-1.5 rounded-[10px] text-[13px] transition-colors"
                        style={{ color: "var(--vh-ink-soft)", background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
                      >
                        Results
                      </Link>
                      {e.status === "COMPLETED" && <ReopenElectionButton id={e.id} />}
                      <ArchiveElectionButton id={e.id} archived={false} />
                      <DeleteElectionButton id={e.id} title={e.title} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
