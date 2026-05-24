import { randomUUID, createHash } from "node:crypto"
import { db } from "@/lib/db"

export function hashVoterToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function generateVoterToken(): { token: string; tokenHash: string } {
  const token = randomUUID()
  return { token, tokenHash: hashVoterToken(token) }
}

export const MAX_VOTER_TOKEN_HISTORY = 3

export async function appendVoterToken(voterId: string, tokenHash: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.voterTokenHistory.create({ data: { voterId, tokenHash } })
    const rows = await tx.voterTokenHistory.findMany({
      where: { voterId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    if (rows.length > MAX_VOTER_TOKEN_HISTORY) {
      const idsToDelete = rows.slice(MAX_VOTER_TOKEN_HISTORY).map((r) => r.id)
      await tx.voterTokenHistory.deleteMany({ where: { id: { in: idsToDelete } } })
    }
  })
}

export async function findVoterIdByToken(rawToken: string): Promise<string | null> {
  const row = await db.voterTokenHistory.findUnique({
    where: { tokenHash: hashVoterToken(rawToken) },
    select: { voterId: true },
  })
  return row?.voterId ?? null
}
