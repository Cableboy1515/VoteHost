import { db } from "@/lib/db"
import { computeTallyHash } from "@/lib/verification"

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

  for (const id of ids) {
    const votes = await db.vote.findMany({ where: { electionId: id } })
    const hash = computeTallyHash(votes)
    await db.election.update({
      where: { id },
      data: { tallyHash: hash, tallyHashSetAt: new Date() },
    })
  }

  return ids
}
