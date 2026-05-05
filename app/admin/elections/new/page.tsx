import ElectionForm from "@/components/admin/ElectionForm"

export default function NewElectionPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">New Election</h1>
      <ElectionForm />
    </div>
  )
}
