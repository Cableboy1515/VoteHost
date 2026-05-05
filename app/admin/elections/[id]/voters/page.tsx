import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import VoterManager from "@/components/admin/VoterManager"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default async function VotersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: { voters: { orderBy: { name: "asc" } } },
  })
  if (!election) notFound()

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Voters</h1>
          <p className="text-zinc-500 text-sm">{election.title}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Link href={`/admin/elections/${id}/ballot`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Ballot</Link>
          <Link href={`/admin/elections/${id}/results`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Results →</Link>
        </div>
      </div>
      <VoterManager
        electionId={id}
        electionStatus={election.status}
        initialVoters={election.voters.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          hasVoted: v.hasVoted,
          invitedAt: v.invitedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
