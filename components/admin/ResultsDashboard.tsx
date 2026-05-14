"use client"

import { useEffect, useState } from "react"
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
                {q.type.replace("_", " ")}
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              {sortedOptions.map((o, i) => {
                const votes = "count" in o ? o.count : "firstChoiceCount" in o ? o.firstChoiceCount : 0
                const pct = maxVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0
                const isLeader = i === 0 && votes > 0

                return (
                  <div key={o.optionId}>
                    <div className="flex items-center justify-between mb-1.5 text-[14px]">
                      <span className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                        {isLeader && (
                          <span
                            className="flex-shrink-0 text-[11px] font-medium text-white px-1.5 py-0.5 rounded-[4px]"
                            style={{ background: "var(--vh-accent)" }}
                          >
                            LEAD
                          </span>
                        )}
                        <span className="min-w-0 break-words" style={{ fontWeight: isLeader ? 600 : 400 }}>{o.optionText}</span>
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
                          background: isLeader ? "var(--vh-accent)" : "oklch(0.7 0.04 255)",
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
