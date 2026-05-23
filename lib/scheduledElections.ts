import { db } from "@/lib/db"

export type ScheduledElectionWarning = {
  reason: "no_ballot" | "no_voters" | "past_endsAt"
  label: string
  href: string
}

export type ScheduledElection = {
  id: string
  title: string
  startsAt: string
  warnings: ScheduledElectionWarning[]
}

export async function getScheduledFutureElections(): Promise<ScheduledElection[]> {
  const now = new Date()
  const candidates = await db.election.findMany({
    where: {
      archived: false,
      status: "DRAFT",
      autoActivate: true,
      startsAt: { gt: now },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      _count: { select: { questions: true, voters: true } },
    },
    orderBy: { startsAt: "asc" },
  })

  return candidates.map((e) => {
    const warnings: ScheduledElectionWarning[] = []
    if (e._count.questions === 0) {
      warnings.push({ reason: "no_ballot", label: "Needs ballot questions", href: `/elections/${e.id}/ballot` })
    }
    if (e._count.voters === 0) {
      warnings.push({ reason: "no_voters", label: "Needs voters", href: `/elections/${e.id}/voters` })
    }
    if (e.endsAt && e.endsAt <= now) {
      warnings.push({ reason: "past_endsAt", label: "End date already passed", href: `/elections/${e.id}` })
    }
    return {
      id: e.id,
      title: e.title,
      startsAt: e.startsAt!.toISOString(),
      warnings,
    }
  })
}
