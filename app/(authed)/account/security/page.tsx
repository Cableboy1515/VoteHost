import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import SecurityPanel from "@/components/account/SecurityPanel"

export default async function SecurityPage() {
  const session = await requireRole("VIEWER")
  if (!session) redirect("/login")

  const user = await db.adminUser.findUnique({
    where: { id: session.sub },
    select: { totpEnabledAt: true, recoveryCodeHashes: true, role: true },
  })

  return (
    <SecurityPanel
      totpEnabled={!!user?.totpEnabledAt}
      totpEnabledAt={user?.totpEnabledAt?.toISOString() ?? null}
      recoveryCodesRemaining={user?.recoveryCodeHashes.length ?? 0}
      role={session.role}
    />
  )
}
