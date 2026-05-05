import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import ElectionForm from "@/components/admin/ElectionForm"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function EditElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Edit Election</h1>
        <div className="flex gap-2 ml-auto">
          <Link href={`/admin/elections/${id}/ballot`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Ballot</Link>
          <Link href={`/admin/elections/${id}/voters`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Voters</Link>
          <Link href={`/admin/elections/${id}/results`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Results</Link>
        </div>
      </div>
      <ElectionForm
        electionId={election.id}
        initialValues={{
          title: election.title,
          description: election.description,
          status: election.status,
          startsAt: election.startsAt?.toISOString(),
          endsAt: election.endsAt?.toISOString(),
        }}
      />
    </div>
  )
}
