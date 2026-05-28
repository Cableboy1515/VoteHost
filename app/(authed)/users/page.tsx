export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import UserManager from "@/components/admin/UserManager"

export default async function UsersPage() {
  const existing = await getSession()
  if (!existing) redirect("/login?next=/users")
  const session = await requireRole("ADMIN")
  if (!session) redirect("/dashboard")

  const rawUsers = await db.adminUser.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      invitationExpiresAt: true,
      invitedAt: true,
      invitedById: true,
      passwordResetRequestedAt: true,
      passwordHash: true,
    },
    orderBy: { createdAt: "asc" },
  })
  const idToEmail = new Map(rawUsers.map((u) => [u.id, u.email]))
  const users = rawUsers.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role as "ADMIN" | "ORGANIZER" | "VIEWER",
    createdAt: u.createdAt.toISOString(),
    invitationExpiresAt: u.invitationExpiresAt?.toISOString() ?? null,
    invitedAt: u.invitedAt?.toISOString() ?? null,
    invitedByEmail: u.invitedById ? (idToEmail.get(u.invitedById) ?? null) : null,
    passwordResetRequestedAt: u.passwordResetRequestedAt?.toISOString() ?? null,
    hasPassword: u.passwordHash !== null,
  }))

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-zinc-500 text-sm mt-1">Manage who can access the admin panel.</p>
      </div>
      <UserManager users={users} currentUserId={session.sub} />
    </div>
  )
}
