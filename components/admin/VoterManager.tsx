"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import Papa from "papaparse"
import ActivateElectionButton from "@/components/admin/ActivateElectionButton"
import InvitationProgress, { type ActivationStatus } from "@/components/admin/InvitationProgress"
import { useDisplayTimeZone } from "@/components/TimezoneProvider"

interface Voter {
  id: string
  name: string
  email: string
  hasVoted: boolean
  invitedAt: string | null
  votedAt: string | null
  lastSendStatus: string | null
  lastSendErrorCode: string | null
  lastSendErrorMessage: string | null
  lastSendAttemptAt: string | null
}

interface Props {
  electionId: string
  electionStatus: string
  electionStartsAt: string | null
  electionAutoActivate: boolean
  electionTitle: string
  questionCount: number
  initialVoters: Voter[]
}

interface CSVRow {
  name?: string
  Name?: string
  email?: string
  Email?: string
}

type SortKey = "name" | "email" | "invited" | "voted"
type FilterKey = "all" | "not-invited" | "invited" | "voted" | "failed"

const SEND_FAILURE_STATUSES = new Set(["permanent", "bounced", "transient", "quota", "complained"])

function isFailedStatus(status: string | null): boolean {
  return !!status && SEND_FAILURE_STATUSES.has(status)
}

function truncateText(str: string | null, max: number): string {
  if (!str) return ""
  return str.length > max ? str.slice(0, max) + "…" : str
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
  const fontSize = Math.round(size * 0.38)
  return (
    <span
      className="inline-grid place-items-center flex-shrink-0 font-semibold"
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "var(--vh-surface-3)", color: "var(--vh-ink-soft)",
        border: "1px solid var(--vh-line)", fontSize,
      }}
    >
      {initials}
    </span>
  )
}

function StatusChip({ v }: { v: Voter }) {
  const tz = useDisplayTimeZone()
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })
  if (v.hasVoted) {
    const tip = [v.invitedAt && `Invited ${fmtDate(v.invitedAt)}`, v.votedAt && `Voted ${fmtDate(v.votedAt)}`].filter(Boolean).join(" · ")
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
        title={tip || undefined}
        style={{ background: "var(--vh-success-soft)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.78 0.08 155)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "oklch(0.55 0.13 155)" }} />
        Voted
      </span>
    )
  }
  if (v.lastSendStatus === "bounced" || v.lastSendStatus === "permanent") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
        style={{ background: "var(--vh-danger-soft)", color: "var(--vh-danger)", borderColor: "oklch(0.88 0.06 25)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--vh-danger)" }} />
        Bounced
      </span>
    )
  }
  if (v.lastSendStatus === "quota" || v.lastSendStatus === "complained") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
        style={{ background: "var(--vh-warn-soft)", color: "var(--vh-warn-text)", borderColor: "oklch(0.88 0.07 75)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--vh-warn)" }} />
        Rate-limited
      </span>
    )
  }
  if (v.lastSendStatus === "transient") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
        style={{ background: "var(--vh-danger-soft)", color: "var(--vh-danger)", borderColor: "oklch(0.88 0.06 25)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--vh-danger)" }} />
        Error
      </span>
    )
  }
  if (v.invitedAt) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
        title={`Invited ${fmtDate(v.invitedAt)}`}
        style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)", borderColor: "oklch(0.85 0.05 255)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--vh-accent)" }} />
        Invited
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11.5px] font-medium border"
      style={{ background: "var(--vh-surface-3)", color: "var(--vh-muted)", borderColor: "var(--vh-line-strong)" }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 border" style={{ borderColor: "var(--vh-muted)" }} />
      Not invited
    </span>
  )
}

function isToday(d: Date): boolean {
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function formatScheduledOpen(iso: string, tz: string): string {
  const d = new Date(iso)
  if (isToday(d)) return `today at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}`
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })
}

export default function VoterManager({
  electionId,
  electionStatus,
  electionStartsAt,
  electionAutoActivate,
  electionTitle,
  questionCount,
  initialVoters,
}: Props) {
  const router = useRouter()
  const tz = useDisplayTimeZone()
  const [voters, setVoters] = useState<Voter[]>(initialVoters)
  const [activationStatus, setActivationStatus] = useState<ActivationStatus | null>(null)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [csvPreview, setCsvPreview] = useState<{ name: string; email: string }[]>([])
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Voter | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [filter, setFilter] = useState<FilterKey>("all")
  const [search, setSearch] = useState("")
  const [resending, setResending] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<null | "delete" | "resend">(null)
  const [csvFileName, setCsvFileName] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const wasSendingRef = useRef(false)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = voters
    .filter((v) => {
      if (filter === "voted") return v.hasVoted
      if (filter === "invited") return !!v.invitedAt && !v.hasVoted
      if (filter === "not-invited") return !v.invitedAt
      if (filter === "failed") return isFailedStatus(v.lastSendStatus)
      return true
    })
    .filter((v) => {
      if (!search) return true
      const q = search.toLowerCase()
      return v.name.toLowerCase().includes(q) || v.email.toLowerCase().includes(q)
    })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === "name")    cmp = a.name.localeCompare(b.name)
    if (sortKey === "email")   cmp = a.email.localeCompare(b.email)
    if (sortKey === "invited") cmp = (a.invitedAt ? 1 : 0) - (b.invitedAt ? 1 : 0)
    if (sortKey === "voted")   cmp = (a.hasVoted ? 1 : 0) - (b.hasVoted ? 1 : 0)
    return sortDir === "asc" ? cmp : -cmp
  })

  const allVisibleSelected = sorted.length > 0 && sorted.every((v) => selectedIds.has(v.id))
  const someVisibleSelected = sorted.some((v) => selectedIds.has(v.id)) && !allVisibleSelected

  // Sync local state when RSC re-renders with fresh initialVoters (e.g. after router.refresh())
  useEffect(() => { setVoters(initialVoters) }, [initialVoters])

  const refreshVoters = useCallback(async () => {
    const res = await fetch(`/api/elections/${electionId}/voters`, { cache: "no-store" })
    if (res.ok) {
      const updated = await res.json()
      setVoters(updated)
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev
        const idSet = new Set((updated as Voter[]).map((v) => v.id))
        const next = new Set([...prev].filter((id) => idSet.has(id)))
        return next.size === prev.size ? prev : next
      })
    }
  }, [electionId])

  // Poll activation-status when ACTIVE — drives live voter row updates and banner state.
  // Interval runs continuously so it picks up new send jobs (e.g. resume after adding voters).
  useEffect(() => {
    if (electionStatus !== "ACTIVE") return

    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/elections/${electionId}/activation-status?t=${Date.now()}`, { cache: "no-store" })
        if (!res.ok || cancelled) return
        const data: ActivationStatus = await res.json()
        setActivationStatus(data)
        if (data.sending) {
          wasSendingRef.current = true
          refreshVoters()
        } else if (wasSendingRef.current) {
          wasSendingRef.current = false
          refreshVoters() // one final refresh when send completes
        }
      } catch {}
    }

    poll()
    const intervalId = setInterval(poll, 2000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [electionId, electionStatus, refreshVoters])

  async function handleAddVoter(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch(`/api/elections/${electionId}/voters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    })
    if (res.ok) {
      const { created, skipped } = await res.json()
      setName(""); setEmail("")
      setShowAddModal(false)
      if (created) {
        refreshVoters()
        toast.success("Voter added")
      } else if (skipped) {
        toast.error("That email is already a voter for this election")
      }
      return
    }
    if (res.status === 429) {
      toast.error("Too many additions in the last hour — please wait and try again")
    } else if (res.status === 400) {
      toast.error("Invalid name or email")
    } else if (res.status === 403) {
      toast.error("You don't have permission to add voters")
    } else {
      toast.error("Failed to add voter")
    }
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    Papa.parse<CSVRow>(file, {
      header: true,
      complete: (results) => {
        const rows = results.data
          .map((row) => ({
            name: (row.name ?? row.Name ?? "").trim(),
            email: (row.email ?? row.Email ?? "").trim(),
          }))
          .filter((r) => r.name && r.email)
        setCsvPreview(rows)
      },
    })
  }

  async function handleImportCSV() {
    if (csvPreview.length === 0) return
    const res = await fetch(`/api/elections/${electionId}/voters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(csvPreview),
    })
    if (res.ok) {
      const { created, skipped } = await res.json()
      setCsvPreview([])
      if (fileRef.current) fileRef.current.value = ""
      setShowCsvModal(false)
      refreshVoters()
      toast.success(`Imported ${created} voters${skipped ? ` (${skipped} skipped)` : ""}`)
    } else if (res.status === 429) {
      toast.error("Too many imports in the last hour — please wait and try again")
    } else {
      toast.error("Import failed")
    }
  }

  async function handleSendInvites() {
    setSending(true)
    const res = await fetch(`/api/elections/${electionId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    setSending(false)
    if (res.ok) {
      const { sent, failed } = await res.json()
      refreshVoters()
      toast.success(`Sent ${sent} invitation${sent !== 1 ? "s" : ""}${failed ? `, ${failed} failed` : ""}`)
    } else {
      toast.error("Failed to send invitations")
    }
  }

  async function handleResumeInvites() {
    setSending(true)
    const res = await fetch(`/api/elections/${electionId}/resume-invitations`, { method: "POST" })
    setSending(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? "Failed to start sending invitations")
      return
    }
    const { total } = await res.json()
    setActivationStatus({ total, invited: 0, failed: 0, sending: true, stopped: false })
    wasSendingRef.current = true
  }

  async function handleResend(voter: Voter) {
    setResending((prev) => new Set(prev).add(voter.id))
    try {
      const res = await fetch(`/api/elections/${electionId}/voters/${voter.id}/invite`, { method: "POST" })
      if (res.status === 429) {
        toast.error("Slow down — try again in a few minutes")
      } else if (!res.ok) {
        const { error } = await res.json().catch(() => ({}))
        toast.error(error ?? "Failed to resend invitation")
      } else {
        toast.success(`Invitation resent to ${voter.email}`)
        refreshVoters()
      }
    } finally {
      setResending((prev) => {
        const next = new Set(prev); next.delete(voter.id); return next
      })
    }
  }

  async function handleDeleteVoter() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/elections/${electionId}/voters/${deleteTarget.id}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      setDeleteTarget(null); refreshVoters()
      toast.success(`${deleteTarget.name} removed`)
    } else {
      const { error } = await res.json().catch(() => ({}))
      toast.error(error ?? "Failed to remove voter")
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  function toggleVoter(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const visibleIds = sorted.map((v) => v.id)
    const allVisible = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    if (allVisible) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        visibleIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  async function handleBulkDelete() {
    setBulkBusy("delete")
    const res = await fetch(`/api/elections/${electionId}/voters/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterIds: [...selectedIds] }),
    })
    setBulkBusy(null)
    setBulkDeleteOpen(false)
    if (!res.ok) {
      toast.error(res.status === 429 ? "Too many bulk operations — please wait and try again" : "Failed to remove voters")
      return
    }
    const { deleted, skippedVoted } = await res.json()
    exitSelectionMode()
    refreshVoters()
    const parts = [`Removed ${deleted} voter${deleted !== 1 ? "s" : ""}`]
    if (skippedVoted > 0) parts.push(`${skippedVoted} skipped (already voted)`)
    if (deleted > 0) toast.success(parts.join(" · "))
    else toast.error("No voters removed" + (skippedVoted > 0 ? ` · ${skippedVoted} skipped (already voted)` : ""))
  }

  async function handleBulkResend() {
    setBulkBusy("resend")
    const res = await fetch(`/api/elections/${electionId}/voters/bulk-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterIds: [...selectedIds] }),
    })
    setBulkBusy(null)
    if (!res.ok) {
      toast.error(res.status === 429 ? "Too many invitations — please wait and try again" : "Failed to resend invitations")
      return
    }
    const { sent, skippedRateLimited, skippedAlreadyVoted, skippedNotInvited, failed } = await res.json()
    exitSelectionMode()
    refreshVoters()
    const extras: string[] = []
    if (skippedRateLimited > 0) extras.push(`${skippedRateLimited} skipped (sent recently)`)
    if (skippedAlreadyVoted > 0) extras.push(`${skippedAlreadyVoted} already voted`)
    if (skippedNotInvited > 0) extras.push(`${skippedNotInvited} not yet invited`)
    if (failed > 0) extras.push(`${failed} failed`)
    const suffix = extras.length > 0 ? ` · ${extras.join(" · ")}` : ""
    if (sent > 0) toast.success(`Resent ${sent} invitation${sent !== 1 ? "s" : ""}${suffix}`)
    else toast.error(`No invitations sent${suffix}`)
  }

  const canDelete = electionStatus !== "COMPLETED"
  // Invitations and resend are only available on ACTIVE elections.
  const canInvite = electionStatus === "ACTIVE"
  const uninvited = voters.filter((v) => !v.invitedAt).length
  // canActivate mirrors server-side logic: need at least one race and one voter.
  const draftCanActivate = questionCount > 0 && voters.length > 0
  const voted = voters.filter((v) => v.hasVoted).length
  const invited = voters.filter((v) => v.invitedAt).length
  const failed = voters.filter((v) => isFailedStatus(v.lastSendStatus)).length
  // A past (or present) startsAt is the same shape as "no start date" from the banner's perspective:
  // the election is ready to activate manually rather than waiting for a scheduled auto-start.
  const isPastStarts = !!electionStartsAt && new Date(electionStartsAt) <= new Date()
  const effectivelyUnscheduled = !electionStartsAt || isPastStarts
  const isTodayFuture = !effectivelyUnscheduled && isToday(new Date(electionStartsAt!))

  const inputStyle = {
    border: "1px solid var(--vh-line-strong)",
    background: "var(--vh-surface)",
    color: "var(--vh-ink)",
    outline: "none",
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "All" },
    { key: "not-invited", label: "Not invited" },
    { key: "invited", label: "Invited" },
    { key: "voted", label: "Voted" },
    { key: "failed", label: "Errors" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <Toaster />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {[
          { label: "Total", value: voters.length, dot: null },
          { label: "Invited", value: invited, dot: "var(--vh-accent)" },
          { label: "Voted", value: voted, dot: "var(--vh-success)" },
          { label: "Not invited", value: uninvited, dot: uninvited > 0 ? "var(--vh-warn)" : null },
          ...(failed > 0 ? [{ label: "Errors", value: failed, dot: "var(--vh-danger)" }] : []),
        ].map((tile) => (
          <div
            key={tile.label}
            className="bg-vh-surface rounded-[14px] p-3.5"
            style={{ border: "1px solid var(--vh-line)" }}
          >
            <div className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>{tile.label}</div>
            <div className="flex items-center gap-2 mt-1">
              {tile.dot && (
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tile.dot }} />
              )}
              <span
                className="text-[24px] font-semibold"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {tile.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Completed read-only notice */}
      {electionStatus === "COMPLETED" && (
        <div
          className="rounded-[14px] px-[18px] py-3.5 text-[13.5px]"
          style={{
            background: "var(--vh-surface-2)",
            border: "1px solid var(--vh-line-strong)",
            color: "var(--vh-ink-soft)",
          }}
        >
          This election is completed. The voter list is read-only.
        </div>
      )}

      {/* Draft activation banners */}
      {electionStatus === "DRAFT" && questionCount === 0 && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
        >
          <span className="text-lg flex-shrink-0">🗳️</span>
          <p className="text-[13.5px]" style={{ color: "var(--vh-ink-soft)" }}>
            <strong>No races yet.</strong>{" "}
            <a href={`/elections/${electionId}/ballot`} style={{ color: "var(--vh-accent)" }}>
              Add at least one race on the Ballot tab
            </a>{" "}
            before activating.
          </p>
        </div>
      )}
      {electionStatus === "DRAFT" && questionCount > 0 && voters.length === 0 && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
        >
          <span className="text-lg flex-shrink-0">👥</span>
          <p className="text-[13.5px]" style={{ color: "var(--vh-ink-soft)" }}>
            <strong>No voters yet.</strong> Add voters below before activating.
          </p>
        </div>
      )}
      {electionStatus === "DRAFT" && draftCanActivate && effectivelyUnscheduled && (
        <div
          className="flex items-center justify-between gap-4 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg flex-shrink-0">🗳️</span>
            <p className="text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
              <strong>Ready to open voting?</strong> Activate now to send invitations and open the ballot.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <ActivateElectionButton
              electionId={electionId}
              electionTitle={electionTitle}
              uninvitedCount={uninvited}
              onActivated={() => router.refresh()}
              onProgressTick={refreshVoters}
            >
              <button
                type="button"
                className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-white transition-colors"
                style={{ background: "var(--vh-accent)" }}
              >
                Activate &amp; Send Invitations
              </button>
            </ActivateElectionButton>
            <a
              href={`/elections/${electionId}`}
              className="text-[13px]"
              style={{ color: "var(--vh-accent-strong)" }}
            >
              Schedule for later ›
            </a>
          </div>
        </div>
      )}
      {electionStatus === "DRAFT" && draftCanActivate && !effectivelyUnscheduled && (
        <div
          className="flex items-center justify-between gap-4 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg flex-shrink-0">📅</span>
            <p className="text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
              {electionAutoActivate ? (
                <>
                  <strong>Voting opens{" "}
                  {formatScheduledOpen(electionStartsAt!, tz)}.
                  </strong>{" "}
                  Invitations will send automatically when the election opens.
                </>
              ) : (
                <>
                  <strong>Voting opens{" "}
                  {formatScheduledOpen(electionStartsAt!, tz)}.
                  </strong>{" "}
                  Auto-start is off — you&apos;ll need to activate manually.
                </>
              )}
            </p>
          </div>
          <ActivateElectionButton
            electionId={electionId}
            electionTitle={electionTitle}
            uninvitedCount={uninvited}
            onActivated={() => router.refresh()}
            onProgressTick={refreshVoters}
          >
            <button
              type="button"
              className="px-3.5 py-2 rounded-[10px] text-[13px] font-medium flex-shrink-0 transition-colors"
              style={{
                border: "1px solid var(--vh-accent)",
                background: "transparent",
                color: "var(--vh-accent-strong)",
              }}
            >
              Activate now
            </button>
          </ActivateElectionButton>
        </div>
      )}

      {/* Uninvited alert — only relevant once election is ACTIVE */}
      {electionStatus === "ACTIVE" && uninvited > 0 && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
        >
          <span className="text-lg flex-shrink-0">📨</span>
          {activationStatus?.sending ? (
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium mb-2" style={{ color: "var(--vh-accent-strong)" }}>
                Sending invitations…
              </p>
              <InvitationProgress status={activationStatus} />
            </div>
          ) : (
            <>
              <div className="flex-1 text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
                {activationStatus?.stopped ? (
                  <>
                    <strong>Sending stopped</strong>
                    {activationStatus.stopReason === "quota" && " — email provider quota reached"}.{" "}
                    {uninvited} voter{uninvited !== 1 ? "s" : ""} not yet invited.
                  </>
                ) : (
                  <>
                    <strong>{uninvited} voter{uninvited !== 1 ? "s" : ""}</strong>{" "}
                    {uninvited !== 1 ? "haven't" : "hasn't"} been invited yet.
                  </>
                )}
              </div>
              <button
                onClick={handleResumeInvites}
                disabled={sending}
                className="px-3.5 py-2 rounded-[10px] text-[13px] font-medium text-white transition-colors disabled:opacity-60 flex-shrink-0"
                style={{ background: "var(--vh-accent)" }}
              >
                {sending ? "Sending…" : activationStatus?.stopped ? "Resume invitations" : `Send ${uninvited} invitation${uninvited !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Voter table */}
      <div
        className="bg-vh-surface rounded-[16px] overflow-hidden"
        style={{ border: "1px solid var(--vh-line)" }}
      >
        {/* Toolbar */}
        <div
          className="flex flex-col gap-2 p-3.5"
          style={{ borderBottom: "1px solid var(--vh-line)", background: "var(--vh-surface-2)" }}
        >
          <input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full text-sm rounded-[10px] px-3 py-2"
            style={inputStyle}
          />
          <div className="flex flex-wrap gap-1.5 items-center">
            <div className="flex gap-1">
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
            </div>
            <div className="flex gap-1.5 ml-auto flex-shrink-0">
              {voters.length > 0 && (
                <button
                  onClick={selectionMode ? exitSelectionMode : () => setSelectionMode(true)}
                  className="px-3.5 py-1.5 rounded-[8px] text-[13px] transition-colors"
                  style={{
                    border: "1px solid var(--vh-line-strong)",
                    background: selectionMode ? "var(--vh-surface-2)" : "var(--vh-surface)",
                    color: "var(--vh-ink-soft)",
                  }}
                >
                  {selectionMode ? "Cancel selection" : "Select voters"}
                </button>
              )}
              {electionStatus !== "COMPLETED" && (
                <>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white transition-colors"
                    style={{ background: "var(--vh-accent)" }}
                  >
                    + Add voter
                  </button>
                  <button
                    onClick={() => setShowCsvModal(true)}
                    className="px-3.5 py-1.5 rounded-[8px] text-[13px] transition-colors"
                    style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
                  >
                    Import CSV
                  </button>
                </>
              )}
              {electionStatus === "ACTIVE" && (
                <button
                  onClick={handleSendInvites}
                  disabled={sending || activationStatus?.sending}
                  className="px-3.5 py-1.5 rounded-[8px] text-[13px] transition-colors disabled:opacity-50"
                  style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
                >
                  {sending || activationStatus?.sending ? "Sending…" : "Send invitations"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Selection action bar */}
        {selectionMode && voters.length > 0 && (
          <div
            className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap"
            style={{ borderBottom: "1px solid var(--vh-line)", background: "var(--vh-surface-2)" }}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                ref={(el) => { if (el) el.indeterminate = someVisibleSelected }}
                onChange={toggleSelectAll}
                className="w-4 h-4 cursor-pointer"
                style={{ accentColor: "var(--vh-accent)" }}
              />
              <span className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
                {allVisibleSelected ? "Deselect all" : "Select all"}
                <span className="ml-1 text-[12px]" style={{ color: "var(--vh-muted)" }}>
                  ({sorted.length})
                </span>
              </span>
            </label>
            {selectedIds.size > 0 && (
              <span className="text-[12.5px]" style={{ color: "var(--vh-muted)" }}>
                {selectedIds.size} selected
              </span>
            )}
            <div className="ml-auto flex gap-1.5">
              {canInvite && (
                <button
                  onClick={handleBulkResend}
                  disabled={selectedIds.size === 0 || bulkBusy !== null}
                  className="px-3 py-1.5 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-40"
                  style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
                >
                  {bulkBusy === "resend" ? "Resending…" : `Resend (${selectedIds.size})`}
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={selectedIds.size === 0 || bulkBusy !== null}
                  className="px-3 py-1.5 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-40"
                  style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-danger)" }}
                >
                  {`Remove (${selectedIds.size})`}
                </button>
              )}
            </div>
          </div>
        )}

        {voters.length === 0 ? (
          <div className="py-14 text-center text-[14px]" style={{ color: "var(--vh-muted)" }}>
            No voters yet. Add one above or import a CSV.
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center text-[14px]" style={{ color: "var(--vh-muted)" }}>
            No voters match this filter.
          </div>
        ) : (
          <>
            {/* Mobile card layout */}
            <div className="sm:hidden divide-y divide-vh-line">
              {sorted.map((v) => (
                <div
                  key={v.id}
                  className="px-4 py-3.5 flex items-start justify-between gap-3"
                  style={selectionMode && selectedIds.has(v.id) ? { background: "var(--vh-accent-soft)" } : undefined}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleVoter(v.id)}
                      className="mt-1 w-4 h-4 flex-shrink-0 cursor-pointer"
                      style={{ accentColor: "var(--vh-accent)" }}
                    />
                  )}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Avatar name={v.name} size={30} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium truncate">{v.name}</p>
                      <p
                        className="text-[12px] truncate"
                        style={{ color: "var(--vh-muted)", fontFamily: "var(--vh-font-mono, monospace)" }}
                      >
                        {v.email}
                      </p>
                      {isFailedStatus(v.lastSendStatus) && (
                        <p
                          className="text-[11px] truncate mt-0.5"
                          title={v.lastSendErrorMessage ?? undefined}
                          style={{ color: "var(--vh-danger)" }}
                        >
                          {v.lastSendErrorCode ? `${v.lastSendErrorCode} · ` : ""}{truncateText(v.lastSendErrorMessage, 60)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    <StatusChip v={v} />
                    {!selectionMode && (
                      <div className="flex gap-1">
                        {(v.invitedAt || isFailedStatus(v.lastSendStatus)) && !v.hasVoted && canDelete && canInvite && (
                          <button
                            disabled={resending.has(v.id)}
                            onClick={() => handleResend(v)}
                            className="px-2.5 py-1 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-50"
                            style={{ color: "var(--vh-ink-soft)", background: "transparent" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                          >
                            {resending.has(v.id) ? "Sending…" : "Resend"}
                          </button>
                        )}
                        <button
                          disabled={v.hasVoted || !canDelete}
                          title={
                            v.hasVoted
                              ? "Cannot remove a voter who has already voted"
                              : !canDelete
                              ? "Voter list cannot be modified after the election closes"
                              : undefined
                          }
                          onClick={() => setDeleteTarget(v)}
                          className="px-2.5 py-1 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-30"
                          style={{ color: "var(--vh-danger)", background: "transparent" }}
                          onMouseEnter={(e) => { if (!v.hasVoted && canDelete) (e.currentTarget as HTMLElement).style.background = "var(--vh-danger-soft)" }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop grid layout */}
            <div
              className="hidden sm:grid"
              style={{ gridTemplateColumns: selectionMode ? "auto 1.5fr 2fr auto auto" : "1.5fr 2fr auto auto" }}
            >
              {sorted.map((v, i) => (
                <div
                  key={v.id}
                  className="grid items-center gap-4 px-[18px] py-3.5 text-[14px]"
                  style={{
                    gridTemplateColumns: "subgrid",
                    gridColumn: "1 / -1",
                    borderTop: i === 0 ? "none" : "1px solid var(--vh-line)",
                    background: selectionMode && selectedIds.has(v.id) ? "var(--vh-accent-soft)" : undefined,
                  }}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleVoter(v.id)}
                      className="w-4 h-4 cursor-pointer"
                      style={{ accentColor: "var(--vh-accent)" }}
                    />
                  )}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={v.name} size={32} />
                    <span className="font-medium truncate">{v.name}</span>
                  </div>
                  <div className="min-w-0">
                    <div
                      className="truncate text-[13px]"
                      style={{ color: "var(--vh-muted)", fontFamily: "var(--vh-font-mono, monospace)" }}
                    >
                      {v.email}
                    </div>
                    {isFailedStatus(v.lastSendStatus) && (
                      <div
                        className="text-[11.5px] mt-0.5 truncate"
                        title={v.lastSendErrorMessage ?? undefined}
                        style={{ color: "var(--vh-danger)" }}
                      >
                        {v.lastSendErrorCode ? `${v.lastSendErrorCode} · ` : ""}{truncateText(v.lastSendErrorMessage, 80)}
                      </div>
                    )}
                  </div>
                  <StatusChip v={v} />
                  <div className="flex gap-1 justify-end">
                    {!selectionMode && (v.invitedAt || isFailedStatus(v.lastSendStatus)) && !v.hasVoted && canDelete && canInvite && (
                      <button
                        disabled={resending.has(v.id)}
                        onClick={() => handleResend(v)}
                        className="px-2.5 py-1 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-50"
                        style={{ color: "var(--vh-ink-soft)", background: "transparent" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                      >
                        {resending.has(v.id) ? "Sending…" : "Resend"}
                      </button>
                    )}
                    {!selectionMode && (
                      <button
                        disabled={v.hasVoted || !canDelete}
                        title={
                          v.hasVoted
                            ? "Cannot remove a voter who has already voted"
                            : !canDelete
                            ? "Voter list cannot be modified after the election closes"
                            : undefined
                        }
                        onClick={() => setDeleteTarget(v)}
                        className="px-2.5 py-1 rounded-[8px] text-[12.5px] transition-colors disabled:opacity-30"
                        style={{ color: "var(--vh-danger)", background: "transparent" }}
                        onMouseEnter={(e) => { if (!v.hasVoted && canDelete) (e.currentTarget as HTMLElement).style.background = "var(--vh-danger-soft)" }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add voter modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add voter</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddVoter} className="flex flex-col gap-3 pt-1">
            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoCapitalize="words"
                autoComplete="name"
                className="w-full text-sm rounded-[10px] px-3 py-2.5"
                style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink)", outline: "none" }}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--vh-ink-soft)" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                className="w-full text-sm rounded-[10px] px-3 py-2.5"
                style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink)", outline: "none" }}
              />
            </div>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-[10px] text-sm transition-colors"
                style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition-colors"
                style={{ background: "var(--vh-accent)" }}
              >
                Add voter
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* CSV import modal */}
      <Dialog open={showCsvModal} onOpenChange={(open) => { if (!open) { setCsvPreview([]); setCsvFileName(null); if (fileRef.current) fileRef.current.value = "" } setShowCsvModal(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import voters from CSV</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              CSV must have <code className="bg-vh-surface-2 px-1 rounded">name</code> and <code className="bg-vh-surface-2 px-1 rounded">email</code> columns.
            </p>
            <div className="flex items-center gap-3">
              <label
                htmlFor="csv-file-input"
                className="px-4 py-2 rounded-[10px] text-sm transition-colors cursor-pointer inline-block"
                style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
              >
                Choose CSV file
              </label>
              <input
                id="csv-file-input"
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={handleCSVFile}
                className="sr-only"
              />
              <span className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
                {csvFileName ?? "No file chosen"}
              </span>
            </div>
            {csvPreview.length > 0 && (
              <div>
                <p className="text-[13px] mb-2" style={{ color: "var(--vh-ink-soft)" }}>{csvPreview.length} rows ready to import:</p>
                <div
                  className="max-h-40 overflow-y-auto text-[12px] rounded-[10px] p-3 space-y-1"
                  style={{ border: "1px solid var(--vh-line)", background: "var(--vh-surface-2)" }}
                >
                  {csvPreview.map((r, i) => (
                    <div key={i}>{r.name} — {r.email}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowCsvModal(false)}
              className="px-4 py-2 rounded-[10px] text-sm transition-colors"
              style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleImportCSV}
              disabled={csvPreview.length === 0}
              className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--vh-accent)" }}
            >
              Import {csvPreview.length > 0 ? `${csvPreview.length} voters` : ""}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm modal */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
            This will permanently remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) from the voter list. This cannot be undone.
          </p>
          <DialogFooter>
            <button
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-[10px] text-sm transition-colors"
              style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteVoter}
              disabled={deleting}
              className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--vh-danger)" }}
            >
              {deleting ? "Removing…" : "Remove voter"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirm modal */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(open) => { if (!open) setBulkDeleteOpen(false) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {selectedIds.size} voter{selectedIds.size !== 1 ? "s" : ""}?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px]" style={{ color: "var(--vh-ink-soft)" }}>
            This will permanently remove the selected voters from the election. Voters who have already cast their ballot will be skipped automatically. This cannot be undone.
          </p>
          <DialogFooter>
            <button
              disabled={bulkBusy !== null}
              onClick={() => setBulkDeleteOpen(false)}
              className="px-4 py-2 rounded-[10px] text-sm transition-colors"
              style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkBusy !== null}
              className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--vh-danger)" }}
            >
              {bulkBusy === "delete" ? "Removing…" : `Remove ${selectedIds.size} voter${selectedIds.size !== 1 ? "s" : ""}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
