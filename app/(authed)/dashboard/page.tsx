export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireRole } from "@/lib/auth"
import { DashboardEmpty } from "@/components/admin/DashboardEmpty"
import { autoCompleteElections } from "@/lib/autoCompleteElections"
import { HeroColorPicker } from "@/components/admin/HeroColorPicker"
import { getHeroColor } from "@/lib/heroColors"

function formatTimeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now()
  if (ms <= 0) return "Closing soon"
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  if (d >= 2) return `${d}d left`
  if (h >= 1) return `${h}h left`
  return "< 1h left"
}

type ActiveElection = {
  id: string
  title: string
  endsAt: Date | null
  votedCount: number
  totalVoters: number
  participation: number
  heroColor: string | null
}

function ActiveCard({ e, variant }: { e: ActiveElection; variant: "hero" | "tile" }) {
  const isHero = variant === "hero"
  const color = getHeroColor(e.heroColor)
  return (
    <div
      className="relative rounded-[18px] text-white overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${color.base} 0%, ${color.strong} 100%)`,
        boxShadow: "var(--vh-shadow-md)",
        padding: isHero ? 28 : 22,
      }}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          top: -60, right: -60,
          width: isHero ? 240 : 180, height: isHero ? 240 : 180,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "oklch(0.85 0.18 145)", animation: "vhPulse 1.6s ease-in-out infinite" }}
          />
          <span className="text-[11.5px] tracking-widest opacity-85 uppercase">
            Election in progress
          </span>
        </div>
        <h2
          className={`font-semibold mb-4 break-words leading-tight ${isHero ? "text-[22px] sm:text-[28px] md:text-[34px] lg:text-[40px]" : "text-[18px] sm:text-[20px] lg:text-[22px]"}`}
          style={{ color: "white" }}
          title={e.title}
        >
          {e.title}
        </h2>
        <div className={`flex items-end ${isHero ? "gap-8" : "gap-5"}`}>
          <div>
            <div
              className="font-semibold leading-none"
              style={{ fontVariantNumeric: "tabular-nums", fontSize: isHero ? 44 : 34 }}
            >
              {e.participation}%
            </div>
            <div className="text-[12.5px] opacity-80 mt-1">
              {e.votedCount} of {e.totalVoters} voted
            </div>
          </div>
          {e.endsAt && (
            <div>
              <div
                className="font-medium leading-none"
                style={{ fontSize: isHero ? 28 : 21 }}
              >
                {formatTimeLeft(e.endsAt)}
              </div>
              <div className="text-[12.5px] opacity-80 mt-1">until close</div>
            </div>
          )}
        </div>
        <div className={`flex justify-end gap-2 ${isHero ? "mt-5" : "mt-4"}`}>
          <HeroColorPicker electionId={e.id} currentColor={e.heroColor} />
          <Link
            href={`/elections/${e.id}/voters`}
            className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-[10px] text-[13px] transition-colors hover:[background:rgba(255,255,255,0.20)]"
            style={{ background: "rgba(255,255,255,0.12)", color: "white", border: "1px solid rgba(255,255,255,0.25)" }}
          >
            Voters
          </Link>
          <Link
            href={`/elections/${e.id}/results`}
            className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-[10px] text-[13px] font-semibold transition-colors hover:opacity-90"
            style={{ background: "white", color: color.strong }}
          >
            View live results →
          </Link>
        </div>
        {e.totalVoters > 0 && (
          <div
            className={`${isHero ? "mt-5" : "mt-4"} h-1 rounded-full overflow-hidden`}
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${e.participation}%`, background: "white", transition: "width 240ms ease" }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const session = await requireRole("ORGANIZER")
  if (!session) redirect("/elections")

  await autoCompleteElections()

  const elections = await db.election.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { voters: true } } },
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

  const activeElections: ActiveElection[] = electionsWithStats
    .filter((e) => e.status === "ACTIVE")
    .map((e) => ({
      id: e.id,
      title: e.title,
      endsAt: e.endsAt,
      votedCount: e.votedCount,
      totalVoters: e._count.voters,
      participation: e._count.voters > 0 ? Math.round((e.votedCount / e._count.voters) * 100) : 0,
      heroColor: e.heroColor,
    }))
    .sort((a, b) => {
      if (!a.endsAt) return 1
      if (!b.endsAt) return -1
      return a.endsAt.getTime() - b.endsAt.getTime()
    })

  const totalVoters = electionsWithStats.reduce((sum, e) => sum + e._count.voters, 0)
  const totalVoted = electionsWithStats.reduce((sum, e) => sum + e.votedCount, 0)
  const draftCount = electionsWithStats.filter((e) => e.status === "DRAFT").length

  const hasContent = elections.length > 0
  const variant: "hero" | "tile" = activeElections.length === 1 ? "hero" : "tile"
  const gridCols = activeElections.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"

  return (
    <div className="p-4 sm:p-8 max-w-[1100px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
        <div>
          <h1 className="text-[28px] font-semibold mb-1">Dashboard</h1>
          <p className="text-[14.5px]" style={{ color: "var(--vh-muted)" }}>
            {activeElections.length > 0
              ? `${activeElections.length} active election${activeElections.length !== 1 ? "s" : ""} · ${totalVoted} vote${totalVoted !== 1 ? "s" : ""} cast`
              : `${elections.length} election${elections.length !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <Link
          href="/elections/new"
          className="inline-flex items-center justify-center px-5 py-3 rounded-[10px] text-[15px] font-medium text-white transition-colors hover:[background:var(--vh-accent-strong)]"
          style={{ background: "var(--vh-accent)" }}
        >
          + New election
        </Link>
      </div>

      {!hasContent ? (
        <DashboardEmpty />
      ) : (
        <>
          {activeElections.length > 0 && (
            <div className={`grid gap-4 mb-5 ${gridCols}`}>
              {activeElections.map((e) => (
                <ActiveCard key={e.id} e={e} variant={variant} />
              ))}
            </div>
          )}

          {activeElections.length === 0 && (
            <div
              className="bg-vh-surface rounded-[14px] px-5 py-8 mb-5 text-center"
              style={{ border: "1px solid var(--vh-line)" }}
            >
              <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
                No elections are currently active.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { label: "Total elections", value: String(elections.length), note: `${draftCount} draft${draftCount !== 1 ? "s" : ""}` },
              { label: "Votes cast", value: String(totalVoted), note: "Across all elections" },
              { label: "Total voters", value: String(totalVoters), note: "Across all elections" },
            ].map((tile) => (
              <div
                key={tile.label}
                className="bg-vh-surface rounded-[14px] p-[18px]"
                style={{ border: "1px solid var(--vh-line)", boxShadow: "var(--vh-shadow-xs)" }}
              >
                <div className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>{tile.label}</div>
                <div className="text-[26px] font-semibold mt-1.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tile.value}
                </div>
                <div className="text-[12.5px] mt-1" style={{ color: "var(--vh-muted)" }}>{tile.note}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Link
              href="/elections"
              className="text-[13.5px] font-medium transition-colors hover:[color:var(--vh-accent-strong)]"
              style={{ color: "var(--vh-accent)" }}
            >
              View all elections →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
