// Pure ranked-choice tally functions — no DB access, fully unit-testable.
// IRV (seats=1) and STV (seats>1) share the same ballot input format.

export type RankedChoiceVoteInput = {
  ballotId: string | null
  optionId: string | null
  rank: number | null
}

/** Reconstruct per-voter ranked preference lists from raw Vote rows. */
export function groupBallots(votes: RankedChoiceVoteInput[]): string[][] {
  const map = new Map<string, Array<{ optionId: string; rank: number }>>()
  for (const v of votes) {
    if (!v.ballotId || !v.optionId || v.rank === null) continue
    if (!map.has(v.ballotId)) map.set(v.ballotId, [])
    map.get(v.ballotId)!.push({ optionId: v.optionId, rank: v.rank })
  }
  const ballots: string[][] = []
  for (const rankings of map.values()) {
    rankings.sort((a, b) => a.rank - b.rank)
    ballots.push(rankings.map((r) => r.optionId))
  }
  return ballots
}

// ─── IRV (single-winner instant-runoff) ──────────────────────────────────────

export type IrvRound = {
  round: number
  counts: Record<string, number> // optionId → vote count this round
  totalActive: number // ballots with a valid preference
  eliminated: string[] // optionId(s) eliminated at end of this round
}

export type IrvResult = {
  winner: string | null // winning optionId, null on full tie
  isTie: boolean
  tiedOptions: string[] // non-empty only when isTie=true
  rounds: IrvRound[]
}

/**
 * Run IRV (instant-runoff voting) on a set of ranked ballots.
 *
 * Tie-break rule (deterministic): when multiple candidates share the lowest
 * count, eliminate the one with the fewest first-preference votes in round 1;
 * if still tied, eliminate alphabetically by optionId (stable across runs).
 */
export function runIRV(ballots: string[][], allOptionIds: string[]): IrvResult {
  if (ballots.length === 0 || allOptionIds.length === 0) {
    return { winner: null, isTie: false, tiedOptions: [], rounds: [] }
  }

  if (allOptionIds.length === 1) {
    const id = allOptionIds[0]
    const count = ballots.filter((b) => b[0] === id).length
    return {
      winner: id,
      isTie: false,
      tiedOptions: [],
      rounds: [{ round: 1, counts: { [id]: count }, totalActive: count, eliminated: [] }],
    }
  }

  let active = new Set(allOptionIds)
  const rounds: IrvRound[] = []
  let round1Counts: Record<string, number> = {}

  while (active.size > 1) {
    const roundNum = rounds.length + 1

    // Count first active preference on each ballot
    const counts: Record<string, number> = {}
    for (const id of active) counts[id] = 0
    let totalActive = 0
    for (const ballot of ballots) {
      const top = ballot.find((id) => active.has(id))
      if (top) { counts[top]++; totalActive++ }
    }

    if (roundNum === 1) round1Counts = { ...counts }

    // Majority check (strict: >50% of active ballots)
    for (const [id, count] of Object.entries(counts)) {
      if (totalActive > 0 && count * 2 > totalActive) {
        rounds.push({ round: roundNum, counts, totalActive, eliminated: [] })
        return { winner: id, isTie: false, tiedOptions: [], rounds }
      }
    }

    const minCount = Math.min(...Object.values(counts))
    const minCandidates = Object.entries(counts)
      .filter(([, c]) => c === minCount)
      .map(([id]) => id)

    // All remaining are tied → full tie, no winner
    if (minCandidates.length === active.size) {
      rounds.push({ round: roundNum, counts, totalActive, eliminated: [] })
      return { winner: null, isTie: true, tiedOptions: [...active], rounds }
    }

    // Eliminate one deterministically
    const toEliminate =
      minCandidates.length === 1
        ? minCandidates[0]
        : [...minCandidates].sort((a, b) => {
            const diff = (round1Counts[a] ?? 0) - (round1Counts[b] ?? 0)
            return diff !== 0 ? diff : a < b ? -1 : 1
          })[0]

    rounds.push({ round: roundNum, counts, totalActive, eliminated: [toEliminate] })
    active.delete(toEliminate)
  }

  // Single candidate remaining after eliminations
  const lastId = [...active][0]
  const finalCounts: Record<string, number> = { [lastId]: 0 }
  let finalTotal = 0
  for (const ballot of ballots) {
    const top = ballot.find((id) => active.has(id))
    if (top) { finalCounts[top]++; finalTotal++ }
  }
  if (rounds.length === 0 || rounds[rounds.length - 1].eliminated.length > 0) {
    rounds.push({ round: rounds.length + 1, counts: finalCounts, totalActive: finalTotal, eliminated: [] })
  }

  return { winner: lastId, isTie: false, tiedOptions: [], rounds }
}

// ─── STV (multi-winner single transferable vote, Gregory method) ─────────────

export type StvRound = {
  round: number
  counts: Record<string, number> // optionId → current weighted vote count (rounded for display)
  quota: number
  elected: string[] // newly elected this round
  eliminated: string[] // newly eliminated this round
}

export type StvResult = {
  winners: string[]
  quota: number
  rounds: StvRound[]
}

/**
 * Run STV with Droop quota and Gregory surplus transfer.
 * seats=1 is equivalent to IRV; prefer runIRV for cleaner output when seats=1.
 *
 * Gap 2: Elimination tie-break now mirrors IRV — fewest round-1 first-preference
 * votes first, then alphabetical by optionId as a final deterministic fallback.
 *
 * Gap 6: Droop quota is recomputed each round from non-exhausted weighted votes
 * so that partial rankings (exhausted ballots) don't make the quota unreachable.
 * StvResult.quota holds the initial (first-round) quota for display purposes.
 */
export function runSTV(
  ballots: string[][],
  allOptionIds: string[],
  seats: number,
): StvResult {
  if (seats <= 0 || allOptionIds.length === 0 || ballots.length === 0) {
    return { winners: [], quota: 0, rounds: [] }
  }
  if (seats >= allOptionIds.length) {
    return { winners: [...allOptionIds], quota: 1, rounds: [] }
  }

  // Weighted ballots (weight starts at 1.0; reduced on surplus transfer)
  const wBallots = ballots.map((prefs) => ({ prefs, weight: 1.0 }))

  const elected: string[] = []
  const eliminated: string[] = []
  const rounds: StvRound[] = []

  // Round-1 raw counts for elimination tie-breaking (mirrors IRV's back-count rule)
  let round1RawCounts: Record<string, number> = {}
  // Initial quota captured from the first counting round; returned in StvResult.quota
  let initialQuota = 0

  const isActive = (id: string) => !elected.includes(id) && !eliminated.includes(id)
  const topActive = (prefs: string[]) => prefs.find(isActive) ?? null

  while (elected.length < seats) {
    const remaining = allOptionIds.filter(isActive)
    if (remaining.length === 0) break

    const seatsNeeded = seats - elected.length

    // Dynamic Droop quota: recomputed each round from non-exhausted weighted votes.
    // As ballots exhaust (partial rankings), activeVotes shrinks so the quota stays
    // reachable. Fixed quota (totalVotes / (seats+1) + 1) is the degenerate case
    // when no ballots exhaust (i.e., all voters rank all candidates).
    const activeVotes = wBallots.reduce(
      (s, wb) => (topActive(wb.prefs) !== null ? s + wb.weight : s),
      0,
    )
    if (activeVotes === 0) break
    const quota = Math.floor(activeVotes / (seats + 1)) + 1
    if (rounds.length === 0) initialQuota = quota

    // Elect all remaining if they're exactly what we need
    if (remaining.length <= seatsNeeded) {
      const counts: Record<string, number> = {}
      for (const id of remaining) {
        counts[id] = Math.round(
          wBallots.reduce((s, wb) => (topActive(wb.prefs) === id ? s + wb.weight : s), 0) * 10,
        ) / 10
      }
      rounds.push({ round: rounds.length + 1, counts, quota, elected: remaining, eliminated: [] })
      elected.push(...remaining)
      break
    }

    // Count weighted first preferences
    const rawCounts: Record<string, number> = {}
    for (const id of remaining) rawCounts[id] = 0
    for (const wb of wBallots) {
      const top = topActive(wb.prefs)
      if (top) rawCounts[top] = (rawCounts[top] ?? 0) + wb.weight
    }
    const displayCounts: Record<string, number> = {}
    for (const [id, c] of Object.entries(rawCounts)) {
      displayCounts[id] = Math.round(c * 10) / 10
    }

    // Capture round-1 first-preference counts for elimination tie-breaking
    if (rounds.length === 0) round1RawCounts = { ...rawCounts }

    // Elect at most seatsNeeded candidates per round, highest counts first.
    // Without this cap, multiple candidates simultaneously reaching quota in
    // one round could push elected.length past seats.
    const newlyElected = remaining
      .filter((id) => rawCounts[id] >= quota)
      .sort((a, b) => (rawCounts[b] ?? 0) - (rawCounts[a] ?? 0))
      .slice(0, seatsNeeded)

    if (newlyElected.length > 0) {
      // Gregory surplus transfer. When winnerVotes === quota (no surplus),
      // transferValue = 0 — those ballots are fully spent and must not flow on.
      for (const winnerId of newlyElected) {
        const winnerVotes = rawCounts[winnerId]
        const transferValue = winnerVotes > quota ? (winnerVotes - quota) / winnerVotes : 0
        for (const wb of wBallots) {
          if (topActive(wb.prefs) === winnerId) wb.weight *= transferValue
        }
      }
      rounds.push({ round: rounds.length + 1, counts: displayCounts, quota, elected: newlyElected, eliminated: [] })
      elected.push(...newlyElected)
    } else {
      // Eliminate lowest — tie-break: fewest round-1 first-preference votes, then
      // alphabetical by optionId as final deterministic fallback (mirrors IRV).
      const minCount = Math.min(...remaining.map((id) => rawCounts[id] ?? 0))
      const minCands = remaining.filter((id) => (rawCounts[id] ?? 0) === minCount)
      const toEliminate =
        minCands.length === 1
          ? minCands[0]
          : [...minCands].sort((a, b) => {
              const diff = (round1RawCounts[a] ?? 0) - (round1RawCounts[b] ?? 0)
              return diff !== 0 ? diff : a < b ? -1 : 1
            })[0]

      rounds.push({ round: rounds.length + 1, counts: displayCounts, quota, elected: [], eliminated: [toEliminate] })
      eliminated.push(toEliminate)
    }
  }

  return { winners: elected, quota: initialQuota, rounds }
}
