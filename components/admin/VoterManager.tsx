"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle,
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
}

interface Props {
  electionId: string
  electionStatus: string
  initialVoters: Voter[]
}

interface CSVRow {
  name?: string
  Name?: string
  email?: string
  Email?: string
}

type SortKey = "name" | "email" | "invited" | "voted"

function SortHeader({
  label, col, sortKey, sortDir, onSort,
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: "asc" | "desc"
  onSort: (col: SortKey) => void
}) {
  const active = sortKey === col
  return (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onSort(col)}>
      {label}{" "}
      {active
        ? (sortDir === "asc" ? "↑" : "↓")
        : <span className="text-zinc-300">↕</span>}
    </TableHead>
  )
}

export default function VoterManager({ electionId, electionStatus, initialVoters }: Props) {
  const [voters, setVoters] = useState<Voter[]>(initialVoters)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [csvPreview, setCsvPreview] = useState<{ name: string; email: string }[]>([])
  const [sending, setSending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Voter | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const fileRef = useRef<HTMLInputElement>(null)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = [...voters].sort((a, b) => {
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
      setName("")
      setEmail("")
      refreshVoters()
      toast.success("Voter added")
    } else {
      toast.error("Failed to add voter (duplicate email?)")
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
      refreshVoters()
      toast.success(`Imported ${created} voters${skipped ? ` (${skipped} skipped)` : ""}`)
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

  async function handleDeleteVoter() {
    if (!deleteTarget) return
    setDeleting(true)
    const res = await fetch(`/api/elections/${electionId}/voters/${deleteTarget.id}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      setDeleteTarget(null)
      refreshVoters()
      toast.success(`${deleteTarget.name} removed`)
    } else {
      const { error } = await res.json().catch(() => ({}))
      toast.error(error ?? "Failed to remove voter")
    }
  }

  const canDelete = electionStatus !== "CLOSED" && electionStatus !== "COMPLETED"
  const uninvited = voters.filter((v) => !v.invitedAt).length

  return (
    <div className="space-y-6">
      <Toaster />

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Add Voter Manually</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleAddVoter} className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit">Add Voter</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Import from CSV</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-zinc-500">CSV must have <code>name</code> and <code>email</code> columns.</p>
            <Input ref={fileRef} type="file" accept=".csv" onChange={handleCSVFile} />
            {csvPreview.length > 0 && (
              <div>
                <p className="text-sm text-zinc-600 mb-2">{csvPreview.length} rows ready to import:</p>
                <div className="max-h-40 overflow-y-auto text-xs border rounded p-2 space-y-1">
                  {csvPreview.map((r, i) => (
                    <div key={i}>{r.name} — {r.email}</div>
                  ))}
                </div>
                <Button className="mt-2" onClick={handleImportCSV}>Import {csvPreview.length} Voters</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {electionStatus === "ACTIVE" && uninvited > 0 && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 rounded border border-blue-200">
          <span className="text-sm text-blue-700">{uninvited} voter{uninvited !== 1 ? "s" : ""} haven&apos;t been invited yet.</span>
          <Button size="sm" onClick={handleSendInvites} disabled={sending}>
            {sending ? "Sending…" : "Send Invitations"}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Voter List ({voters.length})</CardTitle>
            {electionStatus === "ACTIVE" && (
              <Button variant="outline" size="sm" onClick={handleSendInvites} disabled={sending}>
                {sending ? "Sending…" : "Resend All Invites"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {voters.length === 0 ? (
            <p className="text-sm text-zinc-500">No voters yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="Name"    col="name"    sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Email"   col="email"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Invited" col="invited" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <SortHeader label="Voted"   col="voted"   sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.name}</TableCell>
                    <TableCell>{v.email}</TableCell>
                    <TableCell>
                      <Badge variant={v.invitedAt ? "default" : "secondary"}>
                        {v.invitedAt ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.hasVoted ? "default" : "outline"}>
                        {v.hasVoted ? "Voted" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={v.hasVoted || !canDelete}
                        title={
                          v.hasVoted
                            ? "Cannot remove a voter who has already voted"
                            : !canDelete
                            ? "Voter list cannot be modified after election is closed"
                            : undefined
                        }
                        onClick={() => setDeleteTarget(v)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600">
            This will permanently remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.email}) from the voter list. This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteVoter} disabled={deleting}>
              {deleting ? "Removing…" : "Remove Voter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
