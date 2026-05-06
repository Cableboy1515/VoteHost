"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
  mustChangePassword: boolean
  createdAt: string
}

interface Props {
  users: User[]
  currentUserId: string
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  ORGANIZER: "Organizer",
  VIEWER: "Viewer",
}

const ROLE_VARIANTS: Record<Role, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  ORGANIZER: "secondary",
  VIEWER: "outline",
}

export default function UserManager({ users: initialUsers, currentUserId }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>(initialUsers)

  // Create user dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<Role>("ORGANIZER")
  const [creating, setCreating] = useState(false)

  // Reset password dialog state
  const [resetOpen, setResetOpen] = useState(false)
  const [resetUserId, setResetUserId] = useState("")
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  // Delete dialog state
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
      body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
    })
    setCreating(false)
    if (res.ok) {
      setCreateOpen(false)
      setNewEmail("")
      setNewPassword("")
      setNewRole("ORGANIZER")
      await refreshUsers()
      toast.success("User created")
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

  async function handleResetPassword() {
    setResetting(true)
    const res = await fetch(`/api/users/${resetUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    })
    setResetting(false)
    if (res.ok) {
      setResetOpen(false)
      setResetPassword("")
      await refreshUsers()
      toast.success("Password reset — user must change it on next login")
    } else {
      toast.error("Failed to reset password")
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
        <Dialog open={createOpen} onOpenChange={(o) => { if (o) { setNewEmail(""); setNewPassword(""); setNewRole("ORGANIZER") } setCreateOpen(o) }}>
          <DialogTrigger render={<Button />}>+ Add User</DialogTrigger>
          <DialogContent showCloseButton={false}>
            <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
              </div>
              <div className="space-y-1">
                <Label>Temporary password</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} placeholder="Min. 8 characters" />
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
              <p className="text-xs text-zinc-500">The user will be required to change their password on first login.</p>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button onClick={handleCreate} disabled={creating || !newEmail || !newPassword}>
                {creating ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
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
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email} {isSelf && <span className="text-xs text-zinc-400">(you)</span>}</TableCell>
                    <TableCell>
                      <Select
                        value={u.role}
                        disabled={isSelf}
                        onValueChange={(v) => handleRoleChange(u.id, v as Role)}
                      >
                        <SelectTrigger className="w-32 h-7 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">Admin</SelectItem>
                          <SelectItem value="ORGANIZER">Organizer</SelectItem>
                          <SelectItem value="VIEWER">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {u.mustChangePassword
                        ? <Badge variant="secondary">Must change password</Badge>
                        : <Badge variant="outline">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setResetUserId(u.id); setResetPassword(""); setResetOpen(true) }}
                        >
                          Reset password
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

      {/* Reset password dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>New temporary password</Label>
              <Input type="password" value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} minLength={8} placeholder="Min. 8 characters" />
            </div>
            <p className="text-xs text-zinc-500">The user will be required to change this password on next login.</p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleResetPassword} disabled={resetting || resetPassword.length < 8}>
              {resetting ? "Resetting…" : "Reset password"}
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
          <p className="text-sm text-zinc-500 py-2">This user will permanently lose access to VoteHost.</p>
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
