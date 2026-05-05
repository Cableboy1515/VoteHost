import { db } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import Link from "next/link"
import type { ElectionStatus } from "@/lib/generated/prisma/client"
import ArchiveElectionButton from "@/components/admin/ArchiveElectionButton"
import DeleteElectionButton from "@/components/admin/DeleteElectionButton"

const STATUS_COLORS: Record<ElectionStatus, "secondary" | "default" | "outline"> = {
  DRAFT: "secondary",
  ACTIVE: "default",
  CLOSED: "outline",
}

export default async function ArchivePage() {
  const elections = await db.election.findMany({
    where: { archived: true },
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Archived Elections</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Elections moved here are hidden from the dashboard. Unarchive to restore them.
        </p>
      </div>

      {electionsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-500">
            No archived elections.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {electionsWithStats.map((e) => (
            <Card key={e.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{e.title}</CardTitle>
                  <Badge variant={STATUS_COLORS[e.status]}>{e.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">
                    {e.votedCount} / {e._count.voters} voted
                  </span>
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/elections/${e.id}/results`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      Results
                    </Link>
                    <ArchiveElectionButton id={e.id} archived={true} />
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
