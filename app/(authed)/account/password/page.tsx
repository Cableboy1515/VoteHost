import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import PasswordPanel from "@/components/account/PasswordPanel"

export default async function ChangePasswordPage() {
  const session = await requireRole("VIEWER")
  if (!session) redirect("/login")

  return <PasswordPanel />
}
