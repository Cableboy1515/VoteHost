"use client"

import { useState, useRef } from "react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import Papa from "papaparse"

interface Voter {
  id: string
  name: string
  email: string
  hasVoted: boolean
  invitedAt: string | null
  votedAt: string | null
}

interface Props {
  electionId: string
  electionStatus: string
  electionStartsAt: string | null
  initialVoters: Voter[]
}

interface CSVRow {
  name?: string
  Name?: string
  email?: string
  Email?: string
}

type SortKey = "name" | "email" | "invited" | "voted"
type FilterKey = "all" | "not-invited" | "invited" | "voted"

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
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
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

export default function VoterManager({ electionId, electionStatus, electionStartsAt, initialVoters }: Props) {
  const [voters, setVoters] = useState<Voter[]>(initialVoters)
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
  const fileRef = useRef<HTMLInputElement>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("asc") }
  }

  const filtered = voters
    .filter((v) => {
      if (filter === "voted") return v.hasVoted
      if (filter === "invited") return !!v.invitedAt && !v.hasVoted
      if (filter === "not-invited") return !v.invitedAt
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

  async function refreshVoters() {
    const res = await fetch(`/api/elections/${electionId}/voters`)
    if (res.ok) setVoters(await res.json())
  }

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

  const canDelete = electionStatus !== "COMPLETED"
  // Invitations require either ACTIVE status or a scheduled start date in DRAFT.
  const canInvite = electionStatus === "ACTIVE" || (electionStatus === "DRAFT" && !!electionStartsAt)
  const uninvited = voters.filter((v) => !v.invitedAt).length
  const voted = voters.filter((v) => v.hasVoted).length
  const invited = voters.filter((v) => v.invitedAt).length

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

      {/* Draft invite banners */}
      {electionStatus === "DRAFT" && !canInvite && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-warn-soft)", border: "1px solid oklch(0.85 0.08 80)" }}
        >
          <span className="text-lg flex-shrink-0">📅</span>
          <p className="text-[13.5px]" style={{ color: "oklch(0.4 0.12 65)" }}>
            <strong>Set a start date</strong> before sending invitations — voters need to know when to come back.
          </p>
        </div>
      )}
      {electionStatus === "DRAFT" && canInvite && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-accent-soft)", border: "1px solid oklch(0.85 0.05 255)" }}
        >
          <span className="text-lg flex-shrink-0">📨</span>
          <p className="text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
            <strong>Election is in Draft.</strong> Invited voters will see "Voting opens{" "}
            {new Date(electionStartsAt!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            " when they click their link.
          </p>
        </div>
      )}

      {/* Uninvited alert */}
      {uninvited > 0 && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{ background: "var(--vh-accent-soft)" }}
        >
          <span className="text-lg">📨</span>
          <div className="flex-1 text-[13.5px]" style={{ color: "var(--vh-accent-strong)" }}>
            <strong>{uninvited} voter{uninvited !== 1 ? "s" : ""}</strong> {uninvited !== 1 ? "haven't" : "hasn't"} been invited yet.
          </div>
          <button
            onClick={handleSendInvites}
            disabled={sending || !canInvite}
            title={!canInvite ? "Set a start date before sending invitations" : undefined}
            className="px-3.5 py-2 rounded-[10px] text-[13px] font-medium text-white transition-colors disabled:opacity-60"
            style={{ background: "var(--vh-accent)" }}
          >
            {sending ? "Sending…" : `Send ${uninvited} invitation${uninvited !== 1 ? "s" : ""}`}
          </button>
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
              {(electionStatus === "ACTIVE" || (electionStatus === "DRAFT" && canInvite)) && (
                <button
                  onClick={handleSendInvites}
                  disabled={sending || !canInvite}
                  title={!canInvite ? "Set a start date before sending invitations" : undefined}
                  className="px-3.5 py-1.5 rounded-[8px] text-[13px] transition-colors disabled:opacity-50"
                  style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink-soft)" }}
                >
                  {sending ? "Sending…" : "Send invitations"}
                </button>
              )}
            </div>
          </div>
        </div>

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
                <div key={v.id} className="px-4 py-3.5 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={v.name} size={30} />
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium truncate">{v.name}</p>
                      <p
                        className="text-[12px] truncate"
                        style={{ color: "var(--vh-muted)", fontFamily: "var(--vh-font-mono, monospace)" }}
                      >
                        {v.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    <StatusChip v={v} />
                    <div className="flex gap-1">
                      {v.invitedAt && !v.hasVoted && canDelete && canInvite && (
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
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop grid layout */}
            <div className="hidden sm:grid" style={{ gridTemplateColumns: "1.5fr 2fr auto auto" }}>
              {sorted.map((v, i) => (
                <div
                  key={v.id}
                  className="grid items-center gap-4 px-[18px] py-3.5 text-[14px]"
                  style={{
                    gridTemplateColumns: "subgrid",
                    gridColumn: "1 / -1",
                    borderTop: i === 0 ? "none" : "1px solid var(--vh-line)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={v.name} size={32} />
                    <span className="font-medium truncate">{v.name}</span>
                  </div>
                  <div
                    className="truncate text-[13px]"
                    style={{ color: "var(--vh-muted)", fontFamily: "var(--vh-font-mono, monospace)" }}
                  >
                    {v.email}
                  </div>
                  <StatusChip v={v} />
                  <div className="flex gap-1 justify-end">
                    {v.invitedAt && !v.hasVoted && canDelete && canInvite && (
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
      <Dialog open={showCsvModal} onOpenChange={(open) => { if (!open) { setCsvPreview([]); if (fileRef.current) fileRef.current.value = "" } setShowCsvModal(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import voters from CSV</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-[13px]" style={{ color: "var(--vh-muted)" }}>
              CSV must have <code className="bg-vh-surface-2 px-1 rounded">name</code> and <code className="bg-vh-surface-2 px-1 rounded">email</code> columns.
            </p>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVFile} className="text-sm" />
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
    </div>
  )
}
