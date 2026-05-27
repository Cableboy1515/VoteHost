import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import ActivityLogTable from "@/components/admin/ActivityLogTable"
import { GuardLink } from "@/components/admin/UnsavedChangesGuard"

export default async function SystemActivityPage() {
  const session = await requireRole("ADMIN")
  if (!session) redirect("/dashboard")

  return (
    <div className="p-4 sm:p-8 max-w-[1040px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <GuardLink href="/dashboard">Dashboard</GuardLink>
        <span className="mx-1.5">›</span>
        Activity
      </div>
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold mb-1">System Activity</h1>
        <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>
          Audit log of system-wide admin actions — settings changes, user management, 2FA, and backups.
        </p>
      </div>
      <ActivityLogTable apiUrl="/api/activity" scope="system" />
    </div>
  )
}
