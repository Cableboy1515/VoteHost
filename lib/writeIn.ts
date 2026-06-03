import { db } from "@/lib/db"
import { createHash } from "node:crypto"

/** True when any question on the election has allowWriteIn=true. */
export async function electionHasWriteIns(electionId: string): Promise<boolean> {
  const count = await db.question.count({ where: { electionId, allowWriteIn: true } })
  return count > 0
}

/**
 * SHA-256 over the sorted WriteInMerge manifest for this election.
 * Published alongside the tally hash in the audit export so an independent
 * observer can reproduce the merged tally from the raw votes + this manifest.
 * An election with no merges returns a deterministic hash of an empty array.
 */
export async function computeNormalizationManifestHash(electionId: string): Promise<string> {
  const merges = await db.writeInMerge.findMany({
    where: { electionId },
    select: { questionId: true, rawText: true, canonicalLabel: true },
  })
  // Sort in JS — same convention as computeTallyHash / sortBallotVotes — so the hash is
  // independent of DB collation and reproducible by any observer with the same comparator.
  const canonical = [...merges]
    .sort((a, b) => {
      const qDiff = a.questionId.localeCompare(b.questionId)
      if (qDiff !== 0) return qDiff
      return a.rawText.localeCompare(b.rawText)
    })
    .map(({ questionId, rawText, canonicalLabel }) => ({ questionId, rawText, canonicalLabel }))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}
