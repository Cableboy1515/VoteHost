import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import SettingsPanel from "@/components/admin/SettingsPanel"

export default async function SettingsPage() {
  const session = await requireRole("ADMIN")
  if (!session) redirect("/dashboard")

  const hasActiveElections = (await db.election.count({ where: { status: "ACTIVE" } })) > 0

  return <SettingsPanel hasActiveElections={hasActiveElections} />
}
