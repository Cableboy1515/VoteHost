import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import SettingsPanel from "@/components/admin/SettingsPanel"

export default async function SettingsPage() {
  const session = await requireRole("ADMIN")
  if (!session) redirect("/dashboard")

  return <SettingsPanel />
}
