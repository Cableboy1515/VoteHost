import ElectionForm from "@/components/admin/ElectionForm"
import Link from "next/link"

export default function NewElectionPage() {
  return (
    <div className="p-8 max-w-[800px]">
      <div className="text-[13px] mb-3.5" style={{ color: "var(--vh-muted)" }}>
        <Link href="/admin/dashboard">Elections</Link>
        <span className="mx-1.5">›</span>
        <span>New election</span>
      </div>
      <h1 className="text-[26px] font-semibold mb-5">New election</h1>
      <ElectionForm />
    </div>
  )
}
