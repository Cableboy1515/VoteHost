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

  const weightingEnabled = data.weightingEnabled ?? false
  const participationNumerator = weightingEnabled ? (data.votedWeight ?? data.votedCount) : data.votedCount
  const participationDenominator = weightingEnabled ? (data.totalWeight ?? data.totalVoters) : data.totalVoters
  const participationPct = participationDenominator > 0
    ? Math.round((participationNumerator / participationDenominator) * 100)
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
              {weightingEnabled
                ? `${participationNumerator} / ${participationDenominator} weight`
                : `${data.votedCount} / ${data.totalVoters}`}
            </span>
            {weightingEnabled && (
              <span className="text-[11px]" style={{ opacity: 0.5 }}>
                {data.votedCount} of {data.totalVoters} voters
              </span>
            )}
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
          <div className="flex items-center gap-2 mb-3">
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
            {/* ── Ranked Choice: round-by-round table ─────────────────────────── */}
            {q.type === "RANKED_CHOICE" && (() => {
              const rcv = "rcvResult" in q ? q.rcvResult as {
                kind: string
                winner?: string | null
                winners?: string[]
                isTie?: boolean
                tiedOptions?: string[]
                rounds?: Array<{
                  round: number
                  counts: Record<string, number>
                  totalActive?: number
                  quota?: number
                  elected: string[]
                  eliminated: string[]
                }>
              } | null : null

              if (!rcv) return (
                <p className="text-[12px]" style={{ color: "var(--vh-muted)" }}>No votes yet.</p>
              )

              const seats = "seats" in q ? (q.seats as number) : 1
              const rounds = rcv.rounds ?? []
              const optionLabelMap = new Map(options.map((o) => [o.optionId, o.optionText]))

              // Per-candidate metadata derived from rounds
              const meta = new Map<string, {
                eliminatedAfterRound: number | null
                electedInRound: number | null
                isWinner: boolean
                isTied: boolean
                firstChoiceCount: number
              }>()
              for (const opt of options) {
                meta.set(opt.optionId, {
                  eliminatedAfterRound: null,
                  electedInRound: null,
                  isWinner: false,
                  isTied: false,
                  firstChoiceCount: rounds[0]?.counts[opt.optionId] ?? 0,
                })
              }
              for (const r of rounds) {
                for (const id of r.eliminated ?? []) {
                  const m = meta.get(id); if (m) m.eliminatedAfterRound = r.round
                }
                for (const id of r.elected ?? []) {
                  const m = meta.get(id); if (m) m.electedInRound = r.round
                }
              }
              if (rcv.kind === "irv") {
                if (rcv.winner) { const m = meta.get(rcv.winner); if (m) m.isWinner = true }
                rcv.tiedOptions?.forEach(id => { const m = meta.get(id); if (m) m.isTied = true })
              }
              if (rcv.kind === "stv") {
                rcv.winners?.forEach(id => { const m = meta.get(id); if (m) m.isWinner = true })
              }

              // Sort: winners first (earlier elected = top), then by survival round desc, then first-choice desc
              const sortedCandidates = [...options].sort((a, b) => {
                const ma = meta.get(a.optionId)!
                const mb = meta.get(b.optionId)!
                const aWin = ma.isWinner || ma.isTied
                const bWin = mb.isWinner || mb.isTied
                if (aWin !== bWin) return aWin ? -1 : 1
                if (aWin && bWin) {
                  const ar = ma.electedInRound ?? rounds.length + 1
                  const br = mb.electedInRound ?? rounds.length + 1
                  if (ar !== br) return ar - br
                }
                const aElim = ma.eliminatedAfterRound ?? rounds.length + 1
                const bElim = mb.eliminatedAfterRound ?? rounds.length + 1
                if (aElim !== bElim) return bElim - aElim
                return mb.firstChoiceCount - ma.firstChoiceCount
              })

              // Winner / STV seats badge
              const badge = rcv.kind === "irv" ? (() => {
                const label = rcv.isTie
                  ? `Tied: ${(rcv.tiedOptions ?? []).map(id => optionLabelMap.get(id) ?? id).join(", ")}`
                  : rcv.winner ? `Winner: ${optionLabelMap.get(rcv.winner) ?? rcv.winner}` : null
                if (!label) return null
                return (
                  <div
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] mb-3"
                    style={rcv.isTie
                      ? { background: "var(--vh-surface-2)", color: "var(--vh-muted)" }
                      : { background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }
                    }
                  >
                    {rcv.isTie ? "⊜" : "✓"} {label}
                  </div>
                )
              })() : rcv.kind === "stv" ? (() => {
                const winners = rcv.winners ?? []
                if (!winners.length) return null
                return (
                  <div
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] mb-3"
                    style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }}
                  >
                    ✓ {winners.length} of {seats} seat{seats !== 1 ? "s" : ""} filled: {winners.map(id => optionLabelMap.get(id) ?? id).join(", ")}
                  </div>
                )
              })() : null

              const quota = rounds.find(r => r.quota != null)?.quota ?? null

              return (
                <div>
                  {badge}

                  {quota !== null && (
                    <p className="text-[12px] mb-2" style={{ color: "var(--vh-muted)" }}>
                      Droop quota: {quota} votes needed to win a seat
                    </p>
                  )}

                  {rounds.length > 0 ? (
                    <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--vh-line)" }}>
                      <table className="w-full text-[12.5px] border-collapse" style={{ minWidth: `${130 + rounds.length * 76}px` }}>
                        <thead>
                          <tr>
                            <th
                              className="text-left px-3 py-2.5 font-medium sticky left-0 z-10"
                              style={{
                                background: "var(--vh-surface-2)",
                                color: "var(--vh-muted)",
                                borderBottom: "1px solid var(--vh-line-strong)",
                                minWidth: 130,
                              }}
                            >
                              Candidate
                            </th>
                            {rounds.map((r) => (
                              <th
                                key={r.round}
                                className="text-center px-3 py-2.5 font-medium tabular-nums"
                                style={{
                                  background: "var(--vh-surface-2)",
                                  color: "var(--vh-muted)",
                                  borderBottom: "1px solid var(--vh-line-strong)",
                                  borderLeft: "1px solid var(--vh-line)",
                                  minWidth: 76,
                                }}
                              >
                                Rd {r.round}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedCandidates.map((opt, rowIdx) => {
                            const m = meta.get(opt.optionId)!
                            const isWinnerRow = m.isWinner
                            const isTiedRow = m.isTied

                            return (
                              <tr
                                key={opt.optionId}
                                style={{
                                  background: (isWinnerRow || isTiedRow) ? "var(--vh-accent-soft)" : "transparent",
                                  borderTop: rowIdx > 0 ? "1px solid var(--vh-line)" : "none",
                                }}
                              >
                                {/* Candidate name — sticky left */}
                                <td
                                  className="px-3 py-2.5 font-medium sticky left-0 z-10"
                                  style={{
                                    background: (isWinnerRow || isTiedRow) ? "var(--vh-accent-soft)" : "var(--vh-surface)",
                                    color: (isWinnerRow || isTiedRow) ? "var(--vh-accent-strong)" : "var(--vh-ink)",
                                    maxWidth: 180,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {opt.optionText}
                                </td>

                                {/* One cell per round */}
                                {rounds.map((r) => {
                                  const count = r.counts[opt.optionId]
                                  const alreadyGone =
                                    (m.eliminatedAfterRound !== null && r.round > m.eliminatedAfterRound) ||
                                    (m.electedInRound !== null && r.round > m.electedInRound)
                                  const eliminatedThisRound = m.eliminatedAfterRound === r.round
                                  const electedThisRound = m.electedInRound === r.round
                                  const irvFinalWin = rcv.kind === "irv" && m.isWinner && r.eliminated.length === 0 && count != null
                                  const irvFinalTie = rcv.kind === "irv" && m.isTied && r.eliminated.length === 0 && count != null

                                  if (alreadyGone || count == null) {
                                    return (
                                      <td
                                        key={r.round}
                                        style={{
                                          borderLeft: "1px solid var(--vh-line)",
                                          background: alreadyGone ? "var(--vh-surface-2)" : undefined,
                                        }}
                                      />
                                    )
                                  }

                                  const displayCount = Number.isInteger(count) ? String(count) : String(Math.round(count * 100) / 100)

                                  const marker = eliminatedThisRound
                                    ? <span style={{ color: "var(--vh-danger)" }}>✗</span>
                                    : (electedThisRound || irvFinalWin)
                                      ? <span style={{ color: "var(--vh-accent)" }}>✓</span>
                                      : irvFinalTie
                                        ? <span style={{ color: "var(--vh-muted)" }}>⊜</span>
                                        : null

                                  return (
                                    <td
                                      key={r.round}
                                      className="px-3 py-2.5 text-center tabular-nums"
                                      style={{
                                        borderLeft: "1px solid var(--vh-line)",
                                        color: eliminatedThisRound
                                          ? "var(--vh-muted)"
                                          : (electedThisRound || irvFinalWin)
                                            ? "var(--vh-accent-strong)"
                                            : irvFinalTie
                                              ? "var(--vh-muted)"
                                              : "var(--vh-ink-soft)",
                                        fontWeight: (eliminatedThisRound || electedThisRound || irvFinalWin || irvFinalTie) ? 600 : 400,
                                      }}
                                    >
                                      {displayCount}{marker && <>{" "}{marker}</>}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-[12px] mt-1" style={{ color: "var(--vh-muted)" }}>Counting in progress…</p>
                  )}

                  {rcv.kind === "irv" && rounds.length > 0 && (
                    <p className="text-[12px] mt-2" style={{ color: "var(--vh-muted)" }}>
                      Counts show first-choice votes among the remaining candidates each round; a
                      candidate&rsquo;s later rankings are only transferred after someone is eliminated.
                      {rcv.winner && rounds.length === 1 && (
                        <> {optionLabelMap.get(rcv.winner) ?? rcv.winner} won an outright first-round majority, so no eliminations or transfers were needed.</>
                      )}
                    </p>
                  )}

                  {rcv.kind === "stv" && rounds.length > 0 && (
                    <p className="text-[12px] mt-2" style={{ color: "var(--vh-muted)" }}>
                      Counts use fractional surplus transfers (Gregory method) and are rounded for display,
                      so near-ties can look identical; the result is decided on the exact underlying weights.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* ── Single/Multiple choice: bar chart (not shown for ranked choice) ─ */}
            {q.type !== "RANKED_CHOICE" && (
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
            )}
          </div>
        )
      })}
    </div>
  )
}
