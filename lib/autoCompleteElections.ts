import { db } from "@/lib/db"

export async function autoCompleteElections(): Promise<string[]> {
  const candidates = await db.election.findMany({
    where: { status: "ACTIVE", endsAt: { lt: new Date() } },
    select: { id: true },
  })
  if (candidates.length === 0) return []

  const ids = candidates.map((c) => c.id)
  await db.election.updateMany({
    where: { id: { in: ids } },
    data: { status: "COMPLETED" },
  })
  return ids
}
