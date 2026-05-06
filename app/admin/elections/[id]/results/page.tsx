import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { getResultsForElection } from "@/lib/results"
import ResultsDashboard from "@/components/admin/ResultsDashboard"
import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ElectionStatus } from "@/lib/generated/prisma/client"

const STATUS_COLORS: Record<ElectionStatus, "secondary" | "default" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  CLOSED: "outline",
  COMPLETED: "secondary",
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const election = await db.election.findUnique({ where: { id } })
  if (!election) notFound()

  const initialData = await getResultsForElection(id)

  return (
    <div className="p-8">
      <div className="flex items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Results</h1>
            <Badge variant={STATUS_COLORS[election.status]}>{election.status}</Badge>
          </div>
          <p className="text-zinc-500 text-sm">{election.title}</p>
        </div>
        <div className="flex gap-2 ml-auto">
          <Link href={`/admin/elections/${id}/voters`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Voters</Link>
          <Link href={`/admin/elections/${id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Settings</Link>
        </div>
      </div>
      <ResultsDashboard electionId={id} initialData={initialData} />
    </div>
  )
}
