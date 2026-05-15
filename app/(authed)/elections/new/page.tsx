import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import ElectionForm from "@/components/admin/ElectionForm"
import Link from "next/link"

export default async function NewElectionPage() {
  const session = await requireRole("ORGANIZER")
  if (!session) redirect("/elections")

  return (
    <div className="p-4 sm:p-8 max-w-[800px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <Link href="/dashboard">Elections</Link>
        <span className="mx-1.5">›</span>
        <span>New election</span>
      </div>
      <h1 className="text-[26px] font-semibold mb-5">New election</h1>
      <ElectionForm />
    </div>
  )
}
