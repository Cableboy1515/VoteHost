import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

const audit = JSON.parse(readFileSync("audit.json", "utf8"))

// ── Helper: canonical sort matching the server's algorithm ──────────────────
// Total order: (questionId, optionId, rank, ballotId, writeInText)
// ballotId tie-break ensures the hash is identical regardless of DB row order.
function sortVotes(votes) {
  return [...votes].sort((a, b) => {
    if (a.questionId !== b.questionId) return a.questionId.localeCompare(b.questionId)
    const ao = a.optionId ?? "", bo = b.optionId ?? ""
    if (ao !== bo) return ao.localeCompare(bo)
    const rankDiff = (a.rank ?? 0) - (b.rank ?? 0)
    if (rankDiff !== 0) return rankDiff
    const ab = a.ballotId ?? "", bb = b.ballotId ?? ""
    if (ab !== bb) return ab.localeCompare(bb)
    return (a.writeInText ?? "").localeCompare(b.writeInText ?? "")
  })
}

function sha256(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex")
}

// ── 1. Recompute the tally hash ─────────────────────────────────────────────
const canonical = sortVotes(audit.votes).map(v => ({
  ballotId:    v.ballotId,
  questionId:  v.questionId,
  optionId:    v.optionId,
  rank:        v.rank,
  writeInText: v.writeInText,
  // Weight is included only when > 1, matching lib/verification.ts computeTallyHash
  ...(v.weight && v.weight > 1 ? { weight: v.weight } : {}),
}))
const computed = "sha256:" + sha256(canonical)
const published = audit.tallyHash
console.log("Published hash:", published)
console.log("Computed hash: ", computed)
console.log("Hash match:    ", computed === published ? "YES ✓" : "NO ✗ — results may have been altered")

// ── 2. Re-tally votes (type-aware, full IRV/STV re-tabulation) ─────────────
// The three functions below are a verbatim JS port of lib/tally/rankedChoice.ts.
// If the server engine changes, update this section to match.

function groupBallots(votes) {
  const map = new Map()
  for (const v of votes) {
    if (!v.ballotId || !v.optionId || v.rank == null) continue
    if (!map.has(v.ballotId)) map.set(v.ballotId, [])
    map.get(v.ballotId).push({ optionId: v.optionId, rank: v.rank })
  }
  const ballots = []
  for (const rankings of map.values()) {
    rankings.sort((a, b) => a.rank - b.rank)
    ballots.push(rankings.map(r => r.optionId))
  }
  return ballots
}

function runIRV(ballots, allOptionIds) {
  if (ballots.length === 0 || allOptionIds.length === 0)
    return { winner: null, isTie: false, tiedOptions: [], rounds: [] }
  if (allOptionIds.length === 1) {
    const id = allOptionIds[0]
    const count = ballots.filter(b => b[0] === id).length
    return { winner: id, isTie: false, tiedOptions: [], rounds: [{ round: 1, counts: { [id]: count }, totalActive: count, eliminated: [] }] }
  }
  const active = new Set(allOptionIds)
  const rounds = []
  let round1Counts = {}
  while (active.size > 1) {
    const roundNum = rounds.length + 1
    const counts = {}
    for (const id of active) counts[id] = 0
    let totalActive = 0
    for (const ballot of ballots) {
      const top = ballot.find(id => active.has(id))
      if (top) { counts[top]++; totalActive++ }
    }
    if (roundNum === 1) round1Counts = { ...counts }
    for (const [id, count] of Object.entries(counts)) {
      if (totalActive > 0 && count * 2 > totalActive) {
        rounds.push({ round: roundNum, counts, totalActive, eliminated: [] })
        return { winner: id, isTie: false, tiedOptions: [], rounds }
      }
    }
    const minCount = Math.min(...Object.values(counts))
    const minCandidates = Object.entries(counts).filter(([, c]) => c === minCount).map(([id]) => id)
    if (minCandidates.length === active.size) {
      rounds.push({ round: roundNum, counts, totalActive, eliminated: [] })
      return { winner: null, isTie: true, tiedOptions: [...active], rounds }
    }
    const toEliminate = minCandidates.length === 1 ? minCandidates[0]
      : [...minCandidates].sort((a, b) => {
          const diff = (round1Counts[a] ?? 0) - (round1Counts[b] ?? 0)
          return diff !== 0 ? diff : a < b ? -1 : 1
        })[0]
    rounds.push({ round: roundNum, counts, totalActive, eliminated: [toEliminate] })
    active.delete(toEliminate)
  }
  const lastId = [...active][0]
  const finalCounts = { [lastId]: 0 }
  let finalTotal = 0
  for (const ballot of ballots) {
    const top = ballot.find(id => active.has(id))
    if (top) { finalCounts[top]++; finalTotal++ }
  }
  if (rounds.length === 0 || rounds[rounds.length - 1].eliminated.length > 0)
    rounds.push({ round: rounds.length + 1, counts: finalCounts, totalActive: finalTotal, eliminated: [] })
  return { winner: lastId, isTie: false, tiedOptions: [], rounds }
}

function runSTV(ballots, allOptionIds, seats) {
  if (seats <= 0 || allOptionIds.length === 0 || ballots.length === 0)
    return { winners: [], quota: 0, rounds: [] }
  if (seats >= allOptionIds.length)
    return { winners: [...allOptionIds], quota: 1, rounds: [] }
  const wBallots = ballots.map(prefs => ({ prefs, weight: 1.0 }))
  const elected = []
  const eliminated = []
  const rounds = []
  let round1RawCounts = {}
  let initialQuota = 0
  const isActive = id => !elected.includes(id) && !eliminated.includes(id)
  const topActive = prefs => prefs.find(isActive) ?? null
  while (elected.length < seats) {
    const remaining = allOptionIds.filter(isActive)
    if (remaining.length === 0) break
    const seatsNeeded = seats - elected.length
    const activeVotes = wBallots.reduce((s, wb) => topActive(wb.prefs) !== null ? s + wb.weight : s, 0)
    if (activeVotes === 0) break
    const quota = Math.floor(activeVotes / (seats + 1)) + 1
    if (rounds.length === 0) initialQuota = quota
    if (remaining.length <= seatsNeeded) {
      const counts = {}
      for (const id of remaining)
        counts[id] = Math.round(wBallots.reduce((s, wb) => topActive(wb.prefs) === id ? s + wb.weight : s, 0) * 100) / 100
      rounds.push({ round: rounds.length + 1, counts, quota, elected: remaining, eliminated: [] })
      elected.push(...remaining)
      break
    }
    const rawCounts = {}
    for (const id of remaining) rawCounts[id] = 0
    for (const wb of wBallots) {
      const top = topActive(wb.prefs)
      if (top) rawCounts[top] = (rawCounts[top] ?? 0) + wb.weight
    }
    const displayCounts = {}
    for (const [id, c] of Object.entries(rawCounts)) displayCounts[id] = Math.round(c * 100) / 100
    if (rounds.length === 0) round1RawCounts = { ...rawCounts }
    const newlyElected = remaining.filter(id => rawCounts[id] >= quota)
      .sort((a, b) => (rawCounts[b] ?? 0) - (rawCounts[a] ?? 0))
      .slice(0, seatsNeeded)
    if (newlyElected.length > 0) {
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
      const minCount = Math.min(...remaining.map(id => rawCounts[id] ?? 0))
      const minCands = remaining.filter(id => (rawCounts[id] ?? 0) === minCount)
      const toEliminate = minCands.length === 1 ? minCands[0]
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

console.log("\nVote tallies by question:")
for (const q of audit.questions) {
  const label = id => q.options.find(o => o.id === id)?.text ?? id
  const qVotes = audit.votes.filter(v => v.questionId === q.id)
  console.log(`\n  ${q.text} [${q.type}]`)

  if (q.type === "RANKED_CHOICE") {
    const seats = q.seats ?? 1
    const allOptionIds = q.options.map(o => o.id)
    const ballots = groupBallots(qVotes)
    // First-choice (rank-1) counts per candidate
    const fc = {}
    for (const id of allOptionIds) fc[id] = 0
    for (const ballot of ballots) if (ballot[0]) fc[ballot[0]] = (fc[ballot[0]] ?? 0) + 1
    console.log(`    Method: ${seats > 1 ? "STV" : "IRV"}  |  Seats: ${seats}  |  Ballots cast: ${ballots.length}`)
    console.log("    First-choice counts:")
    for (const id of allOptionIds) console.log(`      ${fc[id].toString().padStart(4)}  ${label(id)}`)
    const result = seats > 1 ? runSTV(ballots, allOptionIds, seats) : runIRV(ballots, allOptionIds)
    if (seats > 1) {
      console.log(`    Droop quota (initial): ${result.quota}`)
      for (const r of result.rounds) {
        console.log(`    Round ${r.round}:`)
        for (const [id, c] of Object.entries(r.counts)) console.log(`      ${String(c).padStart(7)}  ${label(id)}`)
        if (r.elected.length)    console.log(`      → Elected:    ${r.elected.map(label).join(", ")}`)
        if (r.eliminated.length) console.log(`      → Eliminated: ${r.eliminated.map(label).join(", ")}`)
      }
      console.log(`    Winners: ${result.winners.map(label).join(", ") || "(none)"}`)
    } else {
      for (const r of result.rounds) {
        console.log(`    Round ${r.round} (${r.totalActive} active ballots):`)
        for (const [id, c] of Object.entries(r.counts)) console.log(`      ${c.toString().padStart(4)}  ${label(id)}`)
        if (r.eliminated.length) console.log(`      → Eliminated: ${r.eliminated.map(label).join(", ")}`)
      }
      if (result.isTie) console.log(`    Result: TIE between ${result.tiedOptions.map(label).join(", ")}`)
      else              console.log(`    Winner: ${result.winner ? label(result.winner) : "(none)"}`)
    }

  } else if (q.type === "WRITE_IN") {
    const texts = qVotes.map(v => v.writeInText).filter(Boolean)
    const grouped = {}
    for (const t of texts) grouped[t] = (grouped[t] ?? 0) + 1
    const entries = Object.entries(grouped).sort(([, a], [, b]) => b - a)
    console.log(`    ${texts.length} response(s) across ${entries.length} unique answer(s):`)
    console.log(`    Note: responses with identical text are grouped. Spelling/capitalization`)
    console.log(`          variations count as separate entries — normalize before finalizing.`)
    for (const [t, n] of entries) console.log(`      ${n.toString().padStart(4)}  ${t}`)

  } else {
    // SINGLE_CHOICE / MULTIPLE_CHOICE — weight-aware tally
    for (const o of q.options) {
      const count = qVotes
        .filter(v => v.optionId === o.id)
        .reduce((s, v) => s + (v.weight && v.weight > 1 ? v.weight : 1), 0)
      console.log(`      ${count.toString().padStart(4)}  ${o.text}`)
    }
  }
}

// ── 3. Verify ballot receipts ───────────────────────────────────────────────
const groups = Map.groupBy(audit.votes, v => v.ballotId)
let receiptMismatches = 0
for (const [ballotId, ballotVotes] of groups) {
  const ballotCanonical = sortVotes(ballotVotes).map(v => ({
    questionId:  v.questionId,
    optionId:    v.optionId,
    rank:        v.rank,
    writeInText: v.writeInText,
    // Weight is included only when > 1, matching lib/verification.ts computeBallotHash
    ...(v.weight && v.weight > 1 ? { weight: v.weight } : {}),
  }))
  const ballotHash = sha256(ballotCanonical)
  if (!audit.ballotReceipts.some(r => r.ballotHash === ballotHash)) {
    console.error(`  No receipt found for ballotId ${ballotId}`)
    receiptMismatches++
  }
}
const uniqueBallots = groups.size
const receiptCount = audit.ballotReceipts.length
console.log(`\nBallot receipt check:`)
console.log(`  Unique ballots in votes: ${uniqueBallots}`)
console.log(`  Receipts in ledger:      ${receiptCount}`)
console.log(`  Counts match:            ${uniqueBallots === receiptCount ? "YES ✓" : "NO ✗"}`)
console.log(`  All ballots have a receipt: ${receiptMismatches === 0 ? "YES ✓" : `NO ✗ — ${receiptMismatches} missing`}`)
