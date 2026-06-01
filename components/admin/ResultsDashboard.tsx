"use client"

import { useEffect, useState } from "react"
import CopyButton from "@/components/ui/copy-button"
import type { ElectionResults } from "@/lib/results"

interface Props {
  electionId: string
  initialData: ElectionResults
  endsAt?: string | null
  electionStatus?: string
}

function formatTimeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return "Closed"
  const h = Math.floor(ms / 3_600_000)
  const d = Math.floor(h / 24)
  if (d >= 2) return `${d}d ${h % 24}h`
  if (h >= 1) return `${h}h`
  const m = Math.floor(ms / 60_000)
  return `${m}m`
}

export default function ResultsDashboard({ electionId, initialData, endsAt, electionStatus }: Props) {
  const [data, setData] = useState<ElectionResults>(initialData)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  useEffect(() => {
    const es = new EventSource(`/api/elections/${electionId}/results/stream`)
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data))
        setLastUpdated(new Date())
      } catch {
        // ignore parse errors
      }
    }
    return () => es.close()
  }, [electionId])

  const participationPct = data.totalVoters > 0
    ? Math.round((data.votedCount / data.totalVoters) * 100)
    : 0

  const isLive = electionStatus === "ACTIVE"

  return (
    <div className="flex flex-col gap-3">
      {/* Dark participation strip */}
      <div
        className="rounded-[18px] px-5 sm:px-7 py-6 text-white grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr] gap-4 sm:gap-7 items-center"
        style={{ background: "var(--vh-ink)" }}
      >
        {/* Participation */}
        <div>
          <div
            className="text-[11.5px] uppercase tracking-widest mb-1.5"
            style={{ opacity: 0.7 }}
          >
            Participation
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className="text-[48px] font-semibold leading-none"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {participationPct}<span className="text-[26px]">%</span>
            </span>
            <span className="text-[13px]" style={{ opacity: 0.7 }}>
              {data.votedCount} / {data.totalVoters}
            </span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden mt-3.5"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${participationPct}%`, background: "white" }}
            />
          </div>
        </div>

        {/* Closes in */}
        <div className="border-t sm:border-t-0 sm:border-l pt-4 sm:pt-0 sm:pl-7" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="text-[11.5px] uppercase tracking-widest mb-1" style={{ opacity: 0.7 }}>
            {isLive ? "Closes in" : "Status"}
          </div>
          <div className="text-[22px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {isLive && endsAt ? formatTimeLeft(endsAt) : electionStatus ?? "—"}
          </div>
        </div>

        {/* Live indicator */}
        <div className="border-t sm:border-t-0 sm:border-l pt-4 sm:pt-0 sm:pl-7" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="text-[11.5px] uppercase tracking-widest mb-1" style={{ opacity: 0.7 }}>
            Updates
          </div>
          <div className="flex items-center gap-2 text-[14px]">
            {isLive && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: "oklch(0.85 0.18 145)",
                  animation: "vhPulse 1.6s ease-in-out infinite",
                }}
              />
            )}
            <span className="text-[13px]" style={{ opacity: 0.85 }}>
              {isLive
                ? `Live · ${Math.floor((Date.now() - lastUpdated.getTime()) / 1000) < 10 ? "updated just now" : "streaming"}`
                : "Final results"}
            </span>
          </div>
        </div>
      </div>

      {/* Quorum — only shown when a quorum requirement is set */}
      {data.quorumType !== "NONE" && data.quorumRequired !== null && (
        <div
          className="rounded-[16px] p-5"
          style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--vh-ink)" }}>Quorum</h3>
            <span
              className="text-[12px] font-medium px-2.5 py-1 rounded-full"
              style={data.quorumMet
                ? { background: "var(--vh-success-soft)", color: "var(--vh-success)" }
                : { background: "var(--vh-surface-2)", color: "var(--vh-muted)" }
              }
            >
              {data.quorumMet ? "✓ Met" : "Not yet reached"}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[22px] font-semibold tabular-nums" style={{ color: "var(--vh-ink)" }}>
              {data.votedCount}
            </span>
            <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              of {data.quorumRequired} required
              {data.quorumType === "PERCENT" && data.quorumValue !== null
                ? ` (${data.quorumValue}% of ${data.totalVoters} voters)`
                : ""}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--vh-surface-3)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round((data.votedCount / data.quorumRequired) * 100))}%`,
                background: data.quorumMet ? "var(--vh-success)" : "var(--vh-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Verification section — only shown for completed elections */}
      {electionStatus === "COMPLETED" && data.tallyHash && (
        <div
          className="rounded-[16px] p-5"
          style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line)" }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--vh-ink)" }}>Tally verification</h3>
            <a
              href={`/verify/${data.electionId}`}
              className="text-[12px]"
              style={{ color: "var(--vh-accent)" }}
            >
              Public verification page →
            </a>
          </div>
          <div
            className="flex items-center gap-3 rounded-[10px] px-4 py-3 mb-3"
            style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line)" }}
          >
            <code
              className="flex-1 text-[12px] font-mono break-all"
              style={{ color: "var(--vh-ink-soft)" }}
            >
              sha256:{data.tallyHash}
            </code>
            <CopyButton value={`sha256:${data.tallyHash}`} />
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--vh-muted)" }}>
            Anyone can download the audit export and recompute this hash to confirm the results haven&rsquo;t changed.
          </p>
        </div>
      )}

      {/* Per-question result cards */}
      {data.questions.map((q) => {
        if (q.type === "WRITE_IN") {
          return (
            <div
              key={q.questionId}
              className="bg-vh-surface rounded-[16px] p-6"
              style={{ border: "1px solid var(--vh-line)" }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-4">
                <h3 className="text-[16px] font-semibold min-w-0 flex-1 break-words">{q.questionText}</h3>
                <span
                  className="flex-shrink-0 text-[11.5px] uppercase tracking-wide px-2.5 py-1 rounded-full"
                  style={{ background: "var(--vh-surface-2)", color: "var(--vh-muted)" }}
                >
                  Write-in
                </span>
              </div>
              {"writeIns" in q && q.writeIns.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {(q.writeIns as string[]).map((text, i) => (
                    <li
                      key={i}
                      className="text-[13.5px] rounded-[10px] px-3.5 py-2.5"
                      style={{ background: "var(--vh-surface-2)", color: "var(--vh-ink-soft)" }}
                    >
                      {text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>No responses yet.</p>
              )}
            </div>
          )
        }

        const options = "options" in q ? q.options : []
        const maxVotes = Math.max(
          1,
          ...options.map((o) =>
            "count" in o ? o.count : "firstChoiceCount" in o ? o.firstChoiceCount : 0
          )
        )

        const sortedOptions = [...options].sort((a, b) => {
          const aV = "count" in a ? a.count : "firstChoiceCount" in a ? a.firstChoiceCount : 0
          const bV = "count" in b ? b.count : "firstChoiceCount" in b ? b.firstChoiceCount : 0
          return bV - aV
        })

        const getVotes = (o: (typeof sortedOptions)[number]) =>
          "count" in o ? o.count : "firstChoiceCount" in o ? o.firstChoiceCount : 0
        const topValue = sortedOptions.length > 0 ? getVotes(sortedOptions[0]) : 0
        const isTie = topValue > 0 && sortedOptions.filter((o) => getVotes(o) === topValue).length > 1

        return (
          <div
            key={q.questionId}
            className="bg-vh-surface rounded-[16px] p-6"
            style={{ border: "1px solid var(--vh-line)" }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-5">
              <h3 className="text-[16px] font-semibold min-w-0 flex-1 break-words">{q.questionText}</h3>
              <span
                className="flex-shrink-0 text-[11.5px] uppercase tracking-wide px-2.5 py-1 rounded-full"
                style={{ background: "var(--vh-surface-2)", color: "var(--vh-muted)" }}
              >
                {q.type === "RANKED_CHOICE" ? "Ranked Choice" : q.type === "SINGLE_CHOICE" ? "Single Choice" : q.type === "MULTIPLE_CHOICE" ? "Multiple Choice" : "Write-in"}
              </span>
            </div>
            {q.type === "RANKED_CHOICE" && (() => {
              const rcv = "rcvResult" in q ? q.rcvResult as {
                kind: string
                winner?: string | null
                winners?: string[]
                isTie?: boolean
                tiedOptions?: string[]
                rounds?: Array<{ round: number; counts: Record<string, number>; totalActive?: number; eliminated: string[] }>
              } | null : null

              if (!rcv) return (
                <p className="text-[12px] mb-4" style={{ color: "var(--vh-muted)" }}>
                  No votes yet.
                </p>
              )

              const seats = "seats" in q ? (q.seats as number) : 1
              const optionLabelMap = new Map(options.map((o) => [o.optionId, o.optionText]))

              if (rcv.kind === "irv") {
                const winnerLabel = rcv.isTie
                  ? `Tied: ${(rcv.tiedOptions ?? []).map((id) => optionLabelMap.get(id) ?? id).join(", ")}`
                  : rcv.winner
                    ? `Winner: ${optionLabelMap.get(rcv.winner) ?? rcv.winner}`
                    : null
                const rounds = rcv.rounds ?? []

                return (
                  <div className="mb-4">
                    {winnerLabel && (
                      <div
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] mb-3"
                        style={rcv.isTie
                          ? { background: "var(--vh-surface-2)", color: "var(--vh-muted)" }
                          : { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }
                        }
                      >
                        {rcv.isTie ? "⊜" : "✓"} {winnerLabel}
                      </div>
                    )}
                    {rounds.length > 1 && (
                      <details className="mt-1">
                        <summary
                          className="text-[12px] cursor-pointer select-none"
                          style={{ color: "var(--vh-muted)" }}
                        >
                          {rounds.length} elimination round{rounds.length !== 1 ? "s" : ""} · click to expand
                        </summary>
                        <div className="mt-2 flex flex-col gap-1">
                          {rounds.map((r) => (
                            <div
                              key={r.round}
                              className="text-[11.5px] rounded-[8px] px-3 py-2"
                              style={{ background: "var(--vh-surface-2)", color: "var(--vh-ink-soft)" }}
                            >
                              <span className="font-medium">Round {r.round}</span>
                              {r.eliminated.length > 0 && (
                                <span style={{ color: "var(--vh-muted)" }}>
                                  {" — eliminated: "}{r.eliminated.map((id) => optionLabelMap.get(id) ?? id).join(", ")}
                                </span>
                              )}
                              {r.eliminated.length === 0 && rcv.winner && (
                                <span style={{ color: "var(--vh-accent)" }}>{" — winner declared"}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )
              }

              if (rcv.kind === "stv") {
                const winners = rcv.winners ?? []
                return (
                  <div className="mb-4">
                    <div
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-[8px]"
                      style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }}
                    >
                      ✓ {winners.length} of {seats} seat{seats !== 1 ? "s" : ""} filled
                      {winners.length > 0 && `: ${winners.map((id) => optionLabelMap.get(id) ?? id).join(", ")}`}
                    </div>
                  </div>
                )
              }

              return null
            })()}

            <div className="flex flex-col gap-3.5">
              {sortedOptions.map((o) => {
                const votes = getVotes(o)
                const pct = maxVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0
                const isTop = votes > 0 && votes === topValue
                const chipLabel = !isTop ? null : isTie ? "Tie" : isLive ? "LEAD" : "Winner"

                return (
                  <div key={o.optionId}>
                    <div className="flex items-center justify-between mb-1.5 text-[14px]">
                      <span className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {chipLabel && (
                          <span
                            className="flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-[4px]"
                            style={
                              chipLabel === "Tie"
                                ? { background: "var(--vh-surface-2)", color: "var(--vh-muted)" }
                                : { background: "var(--vh-accent)", color: "#fff" }
                            }
                          >
                            {chipLabel}
                          </span>
                        )}
                        <span className="min-w-0 break-words" style={{ fontWeight: isTop ? 600 : 400 }}>{o.optionText}</span>
                      </span>
                      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--vh-ink-soft)" }}>
                        <strong>{votes}</strong>
                        {data.votedCount > 0 && (
                          <span style={{ color: "var(--vh-muted)" }}>
                            {" · "}{Math.round((votes / data.votedCount) * 100)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div
                      className="h-3 rounded-full overflow-hidden"
                      style={{ background: "var(--vh-surface-3)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: isTop ? "var(--vh-accent)" : "oklch(0.7 0.04 255)",
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
