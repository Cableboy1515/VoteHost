import { randomBytes, createHash, randomUUID } from "node:crypto"

export function generateBallotId(): string {
  return randomUUID()
}

// RFC 4648 base32 alphabet — no external package
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function encodeBase32(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function generateReceiptCode(): string {
  const s = encodeBase32(randomBytes(10)).slice(0, 16).padEnd(16, "A")
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`
}

type BallotVote = {
  questionId: string
  optionId: string | null
  rank: number | null
  writeInText: string | null
  weight?: number
  ballotId?: string | null // optional — present when sorting tally votes, allows full total order
}

function sortBallotVotes<T extends BallotVote>(votes: T[]): T[] {
  return [...votes].sort((a, b) => {
    if (a.questionId !== b.questionId) return a.questionId.localeCompare(b.questionId)
    const ao = a.optionId ?? ""
    const bo = b.optionId ?? ""
    if (ao !== bo) return ao.localeCompare(bo)
    const rankDiff = (a.rank ?? 0) - (b.rank ?? 0)
    if (rankDiff !== 0) return rankDiff
    // ballotId tie-break: makes sort a total order across multi-voter tallies so the
    // resulting hash is identical regardless of the DB row order fed into this function.
    const ab = a.ballotId ?? ""
    const bb = b.ballotId ?? ""
    if (ab !== bb) return ab.localeCompare(bb)
    return (a.writeInText ?? "").localeCompare(b.writeInText ?? "")
  })
}

export function computeBallotHash(votes: BallotVote[]): string {
  const canonical = sortBallotVotes(votes).map((v) => ({
    questionId: v.questionId,
    optionId: v.optionId,
    rank: v.rank,
    writeInText: v.writeInText,
    // Only include weight when non-default — preserves hashes for all existing unweighted ballots
    ...(v.weight && v.weight > 1 ? { weight: v.weight } : {}),
  }))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

type TallyVote = BallotVote & { ballotId: string | null }

export function computeTallyHash(votes: TallyVote[]): string {
  const canonical = sortBallotVotes(votes).map((v) => ({
    ballotId: v.ballotId,
    questionId: v.questionId,
    optionId: v.optionId,
    rank: v.rank,
    writeInText: v.writeInText,
    ...(v.weight && v.weight > 1 ? { weight: v.weight } : {}),
  }))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}
