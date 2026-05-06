import Link from "next/link"
import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ElectionStatus } from "@/lib/generated/prisma/client"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import ReopenElectionButton from "@/components/admin/ReopenElectionButton"
import { autoCompleteElections } from "@/lib/autoCompleteElections"

const STATUS_COLORS: Record<ElectionStatus, "secondary" | "default" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  CLOSED: "outline",
  COMPLETED: "secondary",
}

export default async function DashboardPage() {
  await autoCompleteElections()
  const elections = await db.election.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { voters: true } } },
  })

  const electionsWithStats = await Promise.all(
    elections.map(async (e) => ({
      ...e,
      votedCount: await db.voter.count({ where: { electionId: e.id, hasVoted: true } }),
    }))
  )

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Elections</h1>
        <Link href="/admin/elections/new" className={buttonVariants()}>
          New Election
        </Link>
      </div>

      {electionsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">
            No elections yet.{" "}
            <Link href="/admin/elections/new" className="underline">
              Create one.
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {electionsWithStats.map((e) => (
            <Card key={e.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{e.title}</CardTitle>
                  <Badge
                    variant={STATUS_COLORS[e.status]}
                    className={e.status === "COMPLETED" ? "border-emerald-500 text-emerald-700 bg-emerald-50" : undefined}
                  >
                    {e.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    {e.votedCount} / {e._count.voters} voted
                  </span>
                  <div className="flex gap-2">
                    <Link href={`/admin/elections/${e.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Edit</Link>
                    <Link href={`/admin/elections/${e.id}/voters`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Voters</Link>
                    <Link href={`/admin/elections/${e.id}/results`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Results</Link>
                    {e.status === "COMPLETED" && <ReopenElectionButton id={e.id} />}
                    <ArchiveElectionButton id={e.id} archived={false} />
                    <DeleteElectionButton id={e.id} title={e.title} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
