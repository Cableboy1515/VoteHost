"use client"

import { useState, useEffect, useCallback } from "react"
import { formatAction, actionCategory, formatField, formatRole, formatValue } from "@/lib/activityLabels"
import type { ActionCategory } from "@/lib/activityLabels"

type LogEntry = {
  id: string
  createdAt: string
  actorEmail: string
  actorRole: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string | null
  metadata: Record<string, unknown> | null
}

type FilterOption = { key: ActionCategory | "all"; label: string }

const SYSTEM_FILTERS: FilterOption[] = [
  { key: "all",      label: "All" },
  { key: "settings", label: "System Settings" },
]

const ELECTION_FILTERS: FilterOption[] = [
  { key: "all",       label: "All" },
  { key: "voters",    label: "Voters" },
  { key: "email",     label: "Email" },
  { key: "lifecycle", label: "Settings" },
]

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "var(--vh-danger)",
  ORGANIZER: "var(--vh-accent)",
  VIEWER: "var(--vh-muted)",
  SYSTEM: "var(--vh-muted)",
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7)  return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function formatFull(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function n(v: unknown): number { return typeof v === "number" ? v : 0 }

// "Alice <alice@example.com>" → "Alice — alice@example.com"
function reformatTarget(label: string): string {
  return label.replace(/ <(.+)>$/, " — $1")
}

function getDetail(log: LogEntry): string | null {
  const { action, metadata: meta, targetLabel } = log

  // Single voter identity
  if (action === "voter.add" && meta && typeof meta.name === "string") {
    return `${meta.name} — ${meta.email ?? ""}`
  }
  if (action === "voter.delete" || action === "voter.invite_resent" || action === "voter.recovery_issued") {
    return targetLabel ? reformatTarget(targetLabel) : null
  }

  // Voter batch
  if (action === "voter.csv_import" && meta) {
    const created = n(meta.created), skipped = n(meta.skipped)
    const parts = [`${created} added`]
    if (skipped > 0) parts.push(`${skipped} skipped`)
    const samples = Array.isArray(meta.sampleEmails) ? (meta.sampleEmails as string[]) : []
    if (samples.length > 0) parts.push(`sample: ${samples.join(", ")}`)
    return parts.join(", ")
  }
  if (action === "voter.bulk_delete" && meta) {
    const count = n(meta.count), sv = n(meta.skippedVoted), snf = n(meta.skippedNotFound)
    const parts = [`${count} deleted`]
    if (sv > 0)  parts.push(`${sv} protected (voted)`)
    if (snf > 0) parts.push(`${snf} not found`)
    return parts.join(", ")
  }
  if (action === "voter.bulk_invite" && meta) {
    const sent = n(meta.sent), failed = n(meta.failed)
    const rl = n(meta.skippedRateLimited), av = n(meta.skippedAlreadyVoted), ni = n(meta.skippedNotInvited)
    const parts = [`${sent} sent`]
    if (failed > 0) parts.push(`${failed} failed`)
    if (rl > 0) parts.push(`${rl} rate-limited`)
    if (av > 0) parts.push(`${av} already voted`)
    if (ni > 0) parts.push(`${ni} not invited`)
    return parts.join(", ")
  }

  // Ballot structural diff
  if (action === "election.ballot_update" && meta) {
    const added   = Array.isArray(meta.added)   ? (meta.added   as string[]) : []
    const removed = Array.isArray(meta.removed) ? (meta.removed as string[]) : []
    const editedRaw = Array.isArray(meta.edited) ? (meta.edited as Array<{ text: string; optionsAdded?: number; optionsRemoved?: number; optionsEdited?: number }>) : []
    const lines: string[] = []
    if (added.length)   lines.push(`Added: ${added.map((q) => `"${q}"`).join(", ")}`)
    if (removed.length) lines.push(`Removed: ${removed.map((q) => `"${q}"`).join(", ")}`)
    for (const e of editedRaw) {
      const optParts: string[] = []
      if (e.optionsAdded)   optParts.push(`${e.optionsAdded} added`)
      if (e.optionsRemoved) optParts.push(`${e.optionsRemoved} removed`)
      if (e.optionsEdited)  optParts.push(`${e.optionsEdited} edited`)
      const suffix = optParts.length ? ` (options: ${optParts.join(", ")})` : ""
      lines.push(`Edited: "${e.text}"${suffix}`)
    }
    return lines.length ? lines.join("\n") : null
  }

  // Election/settings diff — new shape
  if (meta?.changes && typeof meta.changes === "object" && !Array.isArray(meta.changes)) {
    const changes = meta.changes as Record<string, { from: unknown; to: unknown }>
    const keys = Object.keys(changes)
    if (keys.length === 0) return null
    return keys
      .map((k) => `${formatField(k)}: ${formatValue(k, changes[k].from)} → ${formatValue(k, changes[k].to)}`)
      .join("\n")
  }

  // Election/settings diff — legacy changedKeys
  if (Array.isArray(meta?.changedKeys) && (meta!.changedKeys as string[]).length > 0) {
    return `Changed: ${(meta!.changedKeys as string[]).map(formatField).join(", ")}`
  }

  // User role change
  if (action === "user.role_change" && meta && typeof meta.from === "string" && typeof meta.to === "string") {
    const arrow = `${formatRole(meta.from)} → ${formatRole(meta.to)}`
    return targetLabel ? `${targetLabel}: ${arrow}` : arrow
  }

  // User invite
  if (action === "user.invite" && targetLabel) {
    const role = typeof meta?.role === "string" ? ` (${formatRole(meta.role)})` : ""
    return `${targetLabel}${role}`
  }

  // User delete
  if (action === "user.delete") {
    return targetLabel
  }

  // Admin backup download
  if (action === "admin.backup_download" && meta) {
    const filename = typeof meta.filename === "string" ? meta.filename : null
    const counts = meta.counts as Record<string, number> | null
    if (filename && counts) {
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      return `${filename} (${total.toLocaleString()} records)`
    }
    return filename
  }

  // Admin restore
  if (action === "admin.restore" && meta) {
    const counts = meta.counts as Record<string, number> | null
    if (counts) {
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      const skipped = n(meta.skippedFiles)
      return skipped > 0
        ? `${total.toLocaleString()} records restored, ${skipped} files skipped`
        : `${total.toLocaleString()} records restored`
    }
    return null
  }

  // System automated events
  if (action === "election.auto_complete" && meta) {
    const parts = [`${n(meta.voteCount)} votes`]
    if (typeof meta.tallyHash === "string") parts.push(`hash: ${meta.tallyHash.slice(0, 12)}…`)
    return parts.join(", ")
  }
  if (action === "election.auto_activate" && meta) {
    return `${n(meta.questionCount)} question${n(meta.questionCount) !== 1 ? "s" : ""}, ${n(meta.voterCount)} voter${n(meta.voterCount) !== 1 ? "s" : ""}`
  }
  if (action === "election.auto_activate_failed" && meta) {
    return typeof meta.reason === "string" ? meta.reason : null
  }
  if ((action === "election.auto_invite_batch" ||
       action === "election.first_reminder_batch" ||
       action === "election.final_reminder_batch") && meta) {
    const parts = [`${n(meta.sent)} sent`]
    if (n(meta.failed) > 0) parts.push(`${n(meta.failed)} failed`)
    if (typeof meta.eligibleCount === "number" && meta.eligibleCount !== meta.sent) {
      parts.push(`of ${n(meta.eligibleCount)} eligible`)
    }
    return parts.join(", ")
  }
  if ((action === "election.results_email_auto_sent" ||
       action === "election.results_email_sent") && meta) {
    const parts = [`${n(meta.sentCount)} sent`]
    if (n(meta.failedCount) > 0) parts.push(`${n(meta.failedCount)} failed`)
    return parts.join(", ")
  }
  if (action === "election.images_purged" && meta && n(meta.purgedCount) > 0) {
    return `${n(meta.purgedCount)} image${n(meta.purgedCount) !== 1 ? "s" : ""} purged`
  }

  // Everything else — the Action label says it all
  return null
}

interface Props {
  apiUrl: string
  scope: "system" | "election"
}

export default function ActivityLogTable({ apiUrl, scope }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<ActionCategory | "all">("all")

  const FILTERS = scope === "system" ? SYSTEM_FILTERS : ELECTION_FILTERS

  const fetchPage = useCallback(async (cursor?: string) => {
    const url = new URL(apiUrl, window.location.origin)
    if (cursor) url.searchParams.set("cursor", cursor)
    const res = await fetch(url.toString(), { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()
    return data as { logs: LogEntry[]; nextCursor: string | null }
  }, [apiUrl])

  useEffect(() => {
    setLoading(true)
    fetchPage().then((data) => {
      if (data) { setLogs(data.logs); setNextCursor(data.nextCursor) }
      setLoading(false)
    })
  }, [fetchPage])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    const data = await fetchPage(nextCursor)
    if (data) {
      setLogs((prev) => [...prev, ...data.logs])
      setNextCursor(data.nextCursor)
    }
    setLoadingMore(false)
  }

  const filtered = filter === "all" ? logs : logs.filter((l) => actionCategory(l.action) === filter)

  if (loading) {
    return <p className="text-[14px] py-8 text-center" style={{ color: "var(--vh-muted)" }}>Loading…</p>
  }

  return (
    <div>
      {/* Filter chips */}
      {scope !== "system" && <div className="flex gap-1 mb-4 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-[8px] text-[13px] transition-colors"
              style={{
                background: active ? "var(--vh-surface)" : "transparent",
                color: active ? "var(--vh-ink)" : "var(--vh-muted)",
                fontWeight: active ? 500 : 400,
                boxShadow: active ? "var(--vh-shadow-xs)" : "none",
                border: active ? "1px solid var(--vh-line-strong)" : "1px solid transparent",
              }}
            >
              {f.label}
            </button>
          )
        })}
      </div>}

      {filtered.length === 0 ? (
        <div
          className="rounded-[14px] px-6 py-12 text-center text-[14px]"
          style={{ border: "1px solid var(--vh-line)", color: "var(--vh-muted)" }}
        >
          No activity yet.
        </div>
      ) : (
        <div
          className="rounded-[14px] overflow-hidden"
          style={{ border: "1px solid var(--vh-line)" }}
        >
          {/* Desktop table */}
          <table className="w-full hidden sm:table" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--vh-surface-2)", borderBottom: "1px solid var(--vh-line)" }}>
                {["When", "User", "Action", "Details"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-2.5 text-[12px] font-medium"
                    style={{ color: "var(--vh-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => {
                const detail = getDetail(log)
                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--vh-line)" : "none",
                      background: "var(--vh-surface)",
                    }}
                  >
                    <td className="px-4 py-3 text-[12.5px] whitespace-nowrap" style={{ color: "var(--vh-muted)" }} title={formatFull(log.createdAt)}>
                      {formatRelative(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-[12.5px]">
                      <div style={{ color: "var(--vh-ink)" }}>
                        {log.actorRole === "SYSTEM" ? "VoteHost (system)" : log.actorEmail}
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: ROLE_COLORS[log.actorRole] ?? "var(--vh-muted)" }}>
                        {log.actorRole === "SYSTEM" ? "system" : log.actorRole.toLowerCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium" style={{ color: "var(--vh-ink)" }}>
                      {formatAction(log.action)}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] max-w-[280px]" style={{ color: "var(--vh-ink-soft)" }}>
                      {detail ? (
                        <span style={{ whiteSpace: "pre-wrap", display: "block" }} title={detail}>
                          {detail}
                        </span>
                      ) : (
                        <span style={{ color: "var(--vh-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y" style={{ borderColor: "var(--vh-line)" }}>
            {filtered.map((log) => {
              const detail = getDetail(log)
              return (
                <div key={log.id} className="px-4 py-3" style={{ background: "var(--vh-surface)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-medium" style={{ color: "var(--vh-ink)" }}>
                      {formatAction(log.action)}
                    </span>
                    <span className="text-[11.5px] flex-shrink-0" style={{ color: "var(--vh-muted)" }} title={formatFull(log.createdAt)}>
                      {formatRelative(log.createdAt)}
                    </span>
                  </div>
                  <div className="text-[12px] mt-1" style={{ color: "var(--vh-muted)" }}>
                    {log.actorRole === "SYSTEM" ? "VoteHost (system)" : log.actorEmail}{" "}
                    <span style={{ color: ROLE_COLORS[log.actorRole] ?? "var(--vh-muted)" }}>
                      ({log.actorRole === "SYSTEM" ? "system" : log.actorRole.toLowerCase()})
                    </span>
                  </div>
                  {detail && (
                    <div className="text-[12px] mt-1" style={{ color: "var(--vh-ink-soft)", whiteSpace: "pre-wrap" }}>
                      {detail}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-4 py-2 rounded-[10px] text-[13px] transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  )
}
