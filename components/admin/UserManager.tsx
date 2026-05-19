"use client"

import { useState } from "react"
import { BRAND_NAME } from "@/lib/branding"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

type Role = "ADMIN" | "ORGANIZER" | "VIEWER"

interface User {
  id: string
  email: string
  role: Role
  hasPassword: boolean
  invitationExpiresAt: string | null
  invitedAt: string | null
  invitedByEmail: string | null
  passwordResetRequestedAt: string | null
  createdAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "yesterday"
  return `${days} days ago`
}

interface Props {
  users: User[]
  currentUserId: string
}

function userStatus(u: User): { label: string; variant: "default" | "secondary" | "outline" | "destructive" } {
  if (u.passwordResetRequestedAt) return { label: "Reset requested", variant: "destructive" }
  if (!u.hasPassword && u.invitationExpiresAt) {
    const exp = new Date(u.invitationExpiresAt)
    if (exp > new Date()) {
      const daysLeft = Math.ceil((exp.getTime() - Date.now()) / 86_400_000)
      return { label: `Invited · ${daysLeft}d left`, variant: "secondary" }
    }
    return { label: "Expired", variant: "outline" }
  }
  return { label: "Active", variant: "outline" }
}

export default function UserManager({ users: initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<User[]>(initialUsers)

  const [createOpen, setCreateOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newRole, setNewRole] = useState<Role>("ORGANIZER")
  const [creating, setCreating] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUser, setInviteUser] = useState<User | null>(null)
  const [inviting, setInviting] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function refreshUsers() {
    const res = await fetch("/api/users")
    if (res.ok) setUsers(await res.json())
  }

  async function handleCreate() {
    setCreating(true)
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, role: newRole }),
    })
    setCreating(false)
    if (res.ok) {
      setCreateOpen(false)
      setNewEmail("")
      setNewRole("ORGANIZER")
      await refreshUsers()
      toast.success("Invitation sent")
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? "Failed to create user")
    }
  }

  async function handleRoleChange(userId: string, role: Role) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      await refreshUsers()
      toast.success("Role updated")
    } else {
      toast.error("Failed to update role")
    }
  }

  async function handleSendInvite() {
    if (!inviteUser) return
    setInviting(true)
    const res = await fetch(`/api/users/${inviteUser.id}/invite`, { method: "POST" })
    setInviting(false)
    if (res.ok) {
      setInviteOpen(false)
      setInviteUser(null)
      await refreshUsers()
      toast.success("Setup link sent")
    } else {
      toast.error("Failed to send setup link")
    }
  }

  async function handleDelete() {
    if (!deleteUser) return
    setDeleting(true)
    const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      setDeleteOpen(false)
      setDeleteUser(null)
      await refreshUsers()
      toast.success("User deleted")
    } else {
      toast.error("Failed to delete user")
    }
  }

  return (
    <div className="space-y-4">
      <Toaster />

      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={(o) => { if (o) { setNewEmail(""); setNewRole("ORGANIZER") } setCreateOpen(o) }}>
          <DialogTrigger render={<Button />}>+ Add User</DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="ORGANIZER">Organizer</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-zinc-500">We&apos;ll email an invitation link to set their password.</p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleCreate} disabled={creating || !newEmail}>
                {creating ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {/* Mobile card layout */}
          <div className="sm:hidden divide-y divide-vh-line">
            {users.map((u) => {
              const isSelf = u.id === currentUserId
              const status = userStatus(u)
              return (
                <div key={u.id} className="px-4 py-3.5 flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium break-all">
                        {u.email} {isSelf && <span className="text-xs text-zinc-400">(you)</span>}
                      </p>
                      {u.invitedAt && (
                        <p className="text-[11.5px] text-zinc-400 mt-0.5">
                          Setup link sent {relativeTime(u.invitedAt)}{u.invitedByEmail ? ` by ${u.invitedByEmail}` : " by deleted user"}
                        </p>
                      )}
                      <p className="text-[12px] text-zinc-500 mt-0.5">
                        Created {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={status.variant} className="flex-shrink-0">{status.label}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={u.role}
                      disabled={isSelf}
                      onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                    >
                      <SelectTrigger className="w-32 h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="ORGANIZER">Organizer</SelectItem>
                        <SelectItem value="VIEWER">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setInviteUser(u); setInviteOpen(true) }}
                      >
                        Send setup link
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSelf}
                        onClick={() => { setDeleteUser(u); setDeleteOpen(true) }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop table */}
          <Table className="hidden sm:table">
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId
                const status = userStatus(u)
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div>{u.email} {isSelf && <span className="text-xs text-zinc-400">(you)</span>}</div>
                      {u.invitedAt && (
                        <div className="text-[11.5px] text-zinc-400 mt-0.5 font-normal">
                          Setup link sent {relativeTime(u.invitedAt)}{u.invitedByEmail ? ` by ${u.invitedByEmail}` : " by deleted user"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        disabled={isSelf}
                        onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                      >
                        <SelectTrigger className="w-32 h-7 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="ORGANIZER">Organizer</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setInviteUser(u); setInviteOpen(true) }}
                        >
                          Send setup link
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isSelf}
                          onClick={() => { setDeleteUser(u); setDeleteOpen(true) }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Send setup link confirmation dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>Send setup link?</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-zinc-500">
              This will send a new setup email to <strong>{inviteUser?.email}</strong>. Any existing invite link or current password will be invalidated.
            </p>
            {inviteUser?.invitedAt && Date.now() - new Date(inviteUser.invitedAt).getTime() < 10 * 60_000 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                A setup link was already sent <strong>{relativeTime(inviteUser.invitedAt)}</strong>
                {inviteUser.invitedByEmail ? <> by <strong>{inviteUser.invitedByEmail}</strong></> : " by another admin"} and is still valid.
                Sending another will invalidate the previous link.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleSendInvite} disabled={inviting}>
              {inviting ? "Sending…" : "Send setup link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{deleteUser?.email}&rdquo;?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500 py-2">This user will permanently lose access to {BRAND_NAME}.</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Yes, delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
