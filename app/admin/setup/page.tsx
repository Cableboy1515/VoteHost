import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import SetupForm from "@/components/admin/SetupForm"

export default async function SetupPage() {
  const count = await db.adminUser.count()
  if (count > 0) redirect("/admin/login")

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <SetupForm />
    </div>
  )
}
