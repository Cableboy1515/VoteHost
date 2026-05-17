import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import SecurityPanel from "@/components/admin/SecurityPanel"

export default async function SecuritySettingsPage() {
  const session = await requireRole("VIEWER")
  if (!session) redirect("/login")

  return <SecurityPanel role={session.role} />
}
