export const runtime = "nodejs"

/**
 * Full-coverage demo election seeder — 1,000 voters, all four question types (≥2 each),
 * optional questions, partial RCV rankings, quorum, and engineered ties for every
 * tally-based question type (SINGLE, MULTIPLE, RANKED). COMMENT gets two free-text
 * questions (no winner concept applies).
 *
 * Audit trail coverage:
 *   Voter-facing : /verify/<id>   — sealed tally hash + receipt-code lookup
 *   Admin/auditor: /elections/<id>/results → audit.json export + activity log
 *
 * Gated by Authorization: Bearer <CRON_SECRET || NEXTAUTH_SECRET>
 * GET    — create demo, cast votes, return self-verified audit report
 * DELETE — remove demo election
 *
 * No emails are sent at any point (no invitedAt set on voters).
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateVoterToken } from "@/lib/voterToken"
import {
  computeBallotHash,
  computeTallyHash,
  generateBallotId,
  generateReceiptCode,
} from "@/lib/verification"
import { groupBallots, runIRV, runSTV } from "@/lib/tally/rankedChoice"
import { recordActivity } from "@/lib/recordActivity"

const DEMO_TITLE = "[Demo] Full Election Test — Do Not Use"
const SEED = "demo-full-2025"
const VOTER_COUNT = 1000
const VOTING_COUNT = 868  // ~86.8% turnout; even → exact ties on Q6 (434/434) and Q7 (348/348)
const VOTE_CHUNK = 500    // keep well under Postgres 65,535 bind-param limit
const WRITE_IN_LOCATIONS = [
  "Community Center", "City Hall", "Main Library",
  "Park Pavilion", "School Gymnasium", "Online / Virtual", "Town Hall",
]
const IMPROVE_RESPONSES = [
  "Better communication before meetings",
  "More social events",
  "Clearer agenda in advance",
  "Shorter meetings",
  "Online participation option",
  "More volunteer opportunities",
]

// ─── PRNG helpers (FNV-1a + mulberry32, same algorithm as BallotForm) ────────

function fnv1a32(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr]
  let a = fnv1a32(seed)
  for (let i = copy.length - 1; i > 0; i--) {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0
    const j = t % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Returns a float in [0, 1) derived from a seed string. */
function seededFloat(seed: string): number {
  let a = fnv1a32(seed)
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t) >>> 0
  return t / 0x100000000
}

/** Returns an integer in [min, max] inclusive derived from a seed string. */
function seededInt(seed: string, min: number, max: number): number {
  return Math.min(max, Math.floor(min + seededFloat(seed) * (max - min + 1)))
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? ""
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || ""
  return !!secret && auth === `Bearer ${secret}`
}

// ─── GET — run the full demo ──────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json(
      { error: "Unauthorized — pass Authorization: Bearer <CRON_SECRET>" },
      { status: 401 },
    )
  }

  const now = new Date()

  // Clean up any prior run
  await db.election.deleteMany({ where: { title: DEMO_TITLE } })

  // ── 1. Election ────────────────────────────────────────────────────────────
  const election = await db.election.create({
    data: {
      title: DEMO_TITLE,
      description:
        "Automated full-coverage demo. Covers all 4 question types (≥2 each), optional questions, " +
        "partial RCV rankings, quorum, and engineered ties for SINGLE, MULTIPLE, and RANKED questions. " +
        "Use audit.json + /verify/<id> to test both audit surfaces. Safe to archive and delete.",
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000),
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),
      activatedAt: new Date(now.getTime() - 60 * 60 * 1000),
      autoActivate: false,
      autoSendResults: false,
      quorumType: "PERCENT",
      quorumValue: 50,
    },
  })

  // ── 2. Questions & options ─────────────────────────────────────────────────

  // Q0 — SINGLE_CHOICE, required — clean winner
  const q0 = await db.question.create({
    data: { electionId: election.id, text: "Who should serve as President?", type: "SINGLE_CHOICE", order: 0, required: true },
  })
  const q0Options = await Promise.all(
    ["Jordan", "Morgan", "Casey", "Riley"].map((t, i) =>
      db.option.create({ data: { questionId: q0.id, text: t, order: i } }),
    ),
  )

  // Q1 — MULTIPLE_CHOICE, required, maxSelections 3 — clean winner
  const q1 = await db.question.create({
    data: { electionId: election.id, text: "Which initiatives should we fund? (choose up to 3)", type: "MULTIPLE_CHOICE", order: 1, required: true, maxSelections: 3 },
  })
  const q1Options = await Promise.all(
    ["Community Garden", "Youth Sports League", "Senior Center Expansion", "Road Repairs", "Library Programs", "Tech Hub"].map((t, i) =>
      db.option.create({ data: { questionId: q1.id, text: t, order: i } }),
    ),
  )

  // Q2 — RANKED_CHOICE IRV (1 seat), required, partial rankings allowed — clean winner
  const q2 = await db.question.create({
    data: { electionId: election.id, text: "Elect the Chair (ranked — instant-runoff)", type: "RANKED_CHOICE", order: 2, required: true, seats: 1 },
  })
  const q2Options = await Promise.all(
    ["Alice", "Bob", "Carol", "David", "Eve"].map((t, i) =>
      db.option.create({ data: { questionId: q2.id, text: t, order: i } }),
    ),
  )

  // Q3 — RANKED_CHOICE STV (3 seats), required, partial rankings allowed — clean winners
  const q3 = await db.question.create({
    data: { electionId: election.id, text: "Elect 3 Board Members (ranked — proportional)", type: "RANKED_CHOICE", order: 3, required: true, seats: 3 },
  })
  const q3Options = await Promise.all(
    ["Frank", "Grace", "Henry", "Iris", "Jack", "Kate", "Leo"].map((t, i) =>
      db.option.create({ data: { questionId: q3.id, text: t, order: i } }),
    ),
  )

  // Q4 — SINGLE_CHOICE, optional (Yes / No) — clean, ~10% skip
  const q4 = await db.question.create({
    data: { electionId: election.id, text: "Should we adopt Amendment 2?", type: "SINGLE_CHOICE", order: 4, required: false },
  })
  const q4Options = await Promise.all(
    ["Yes", "No"].map((t, i) =>
      db.option.create({ data: { questionId: q4.id, text: t, order: i } }),
    ),
  )

  // Q5 — COMMENT (free-text feedback), optional — meeting location, ~10% skip
  const q5 = await db.question.create({
    data: { electionId: election.id, text: "Suggest a future meeting location", type: "COMMENT", order: 5, required: false },
  })

  // Q6 — RANKED_CHOICE IRV (1 seat), required — ENGINEERED TIE
  // 868 voters (even): even vi → [Pat, Robin], odd vi → [Robin, Pat] → exactly 434/434
  const q6 = await db.question.create({
    data: { electionId: election.id, text: "Elect the Treasurer (tie-test — ranked)", type: "RANKED_CHOICE", order: 6, required: true, seats: 1 },
  })
  const q6Pat = await db.option.create({ data: { questionId: q6.id, text: "Pat", order: 0 } })
  const q6Robin = await db.option.create({ data: { questionId: q6.id, text: "Robin", order: 1 } })

  // Q7 — SINGLE_CHOICE, required — ENGINEERED TOP-TWO TIE
  // q7Decoy (≈20%, forced even) voters → Lee; remaining even split → Alex == Sam
  // With VOTING_COUNT=868: decoy=172, Alex=348, Sam=348, Lee=172
  const q7 = await db.question.create({
    data: { electionId: election.id, text: "Who should serve as Vice President? (tie-test — single choice)", type: "SINGLE_CHOICE", order: 7, required: true },
  })
  const q7Alex = await db.option.create({ data: { questionId: q7.id, text: "Alex", order: 0 } })
  const q7Sam  = await db.option.create({ data: { questionId: q7.id, text: "Sam",  order: 1 } })
  const q7Lee  = await db.option.create({ data: { questionId: q7.id, text: "Lee",  order: 2 } })

  // Q8 — MULTIPLE_CHOICE, required, no maxSelections — ENGINEERED TOP TIE
  // Every voter selects Bylaw A + B → A==B==VOTING_COUNT (tied top)
  // Bylaw C: vi%2==0 → 434; Bylaw D: vi%3==0 → 290 (trailing, distinct)
  const q8 = await db.question.create({
    data: { electionId: election.id, text: "Which bylaw amendments do you approve? (tie-test — select all you support)", type: "MULTIPLE_CHOICE", order: 8, required: true },
  })
  const q8BylawA = await db.option.create({ data: { questionId: q8.id, text: "Bylaw A", order: 0 } })
  const q8BylawB = await db.option.create({ data: { questionId: q8.id, text: "Bylaw B", order: 1 } })
  const q8BylawC = await db.option.create({ data: { questionId: q8.id, text: "Bylaw C", order: 2 } })
  const q8BylawD = await db.option.create({ data: { questionId: q8.id, text: "Bylaw D", order: 3 } })

  // Q9 — COMMENT (free-text feedback), optional — improvement suggestions, ~10% skip
  const q9 = await db.question.create({
    data: { electionId: election.id, text: "Name one thing we should improve next year", type: "COMMENT", order: 9, required: false },
  })

  // ── 3. Create 1,000 voters (no invitedAt → no emails ever fire) ─────────────
  await db.voter.createMany({
    data: Array.from({ length: VOTER_COUNT }, (_, i) => ({
      electionId: election.id,
      name: `Demo Voter ${String(i + 1).padStart(4, "0")}`,
      email: `demo.voter${String(i + 1).padStart(4, "0")}@test.invalid`,
    })),
  })
  const allVoters = await db.voter.findMany({
    where: { electionId: election.id },
    orderBy: { name: "asc" },
  })

  // ── 4. Generate tokens for all voters (stored, never emailed) ─────────────
  await db.voterTokenHistory.createMany({
    data: allVoters.map((voter) => ({
      voterId: voter.id,
      tokenHash: generateVoterToken().tokenHash,
    })),
  })

  // ── 5. Determine who votes vs abstains ─────────────────────────────────────
  // Shuffle deterministically; first VOTING_COUNT vote, remaining 132 abstain
  const shuffledVoters = seededShuffle(allVoters, `${SEED}:turnout`)
  const votingVoters = shuffledVoters.slice(0, VOTING_COUNT)
  const votingIds = new Set(votingVoters.map((v) => v.id))

  // Q7 tie geometry: decoy forced even (≈20%)
  const q7Decoy = Math.floor(VOTING_COUNT * 0.2) & ~1  // = 172

  // ── 6. Build ballot rows and receipt data ──────────────────────────────────
  type VoteRowData = {
    electionId: string
    questionId: string
    optionId: string | null
    rank: number | null
    writeInText: string | null
    ballotId: string
    weight: number
  }

  const allVoteRows: VoteRowData[] = []
  const allReceiptData: { electionId: string; receiptCode: string; ballotHash: string }[] = []
  // Collect 5 sample receipt codes for manual verification testing
  const sampleReceipts: { voterName: string; receiptCode: string }[] = []

  for (let vi = 0; vi < votingVoters.length; vi++) {
    const voter = votingVoters[vi]
    const ballotId = generateBallotId()
    const voterRows: VoteRowData[] = []

    // Q0 — SINGLE_CHOICE required: pick 1 option (seeded random)
    const q0Shuffled = seededShuffle(q0Options, `${SEED}:q0:${vi}`)
    voterRows.push({
      electionId: election.id, questionId: q0.id,
      optionId: q0Shuffled[0].id, rank: null, writeInText: null,
      ballotId, weight: 1,
    })

    // Q1 — MULTIPLE_CHOICE required: pick 1-3 unique options (respects maxSelections: 3)
    const q1Shuffled = seededShuffle(q1Options, `${SEED}:q1:${vi}`)
    const q1Count = seededInt(`${SEED}:q1cnt:${vi}`, 1, 3)
    for (const o of q1Shuffled.slice(0, q1Count)) {
      voterRows.push({
        electionId: election.id, questionId: q1.id,
        optionId: o.id, rank: null, writeInText: null,
        ballotId, weight: 1,
      })
    }

    // Q2 — IRV RANKED_CHOICE required: partial ranking of 1..5 candidates
    const q2Shuffled = seededShuffle(q2Options, `${SEED}:q2:${vi}`)
    const q2Len = seededInt(`${SEED}:q2len:${vi}`, 1, q2Options.length)
    q2Shuffled.slice(0, q2Len).forEach((o, rank) => {
      voterRows.push({
        electionId: election.id, questionId: q2.id,
        optionId: o.id, rank: rank + 1, writeInText: null,
        ballotId, weight: 1,
      })
    })

    // Q3 — STV RANKED_CHOICE required: partial ranking of 1..7 candidates
    // Partial rankings cause ballot exhaustion, exercising the dynamic Droop quota
    const q3Shuffled = seededShuffle(q3Options, `${SEED}:q3:${vi}`)
    const q3Len = seededInt(`${SEED}:q3len:${vi}`, 1, q3Options.length)
    q3Shuffled.slice(0, q3Len).forEach((o, rank) => {
      voterRows.push({
        electionId: election.id, questionId: q3.id,
        optionId: o.id, rank: rank + 1, writeInText: null,
        ballotId, weight: 1,
      })
    })

    // Q4 — SINGLE_CHOICE optional: skip ~10% of voters
    if (seededFloat(`${SEED}:q4skip:${vi}`) >= 0.10) {
      const q4Shuffled = seededShuffle(q4Options, `${SEED}:q4:${vi}`)
      voterRows.push({
        electionId: election.id, questionId: q4.id,
        optionId: q4Shuffled[0].id, rank: null, writeInText: null,
        ballotId, weight: 1,
      })
    }

    // Q5 — COMMENT optional: skip ~10%; repeated text values exercise write-in aggregation
    if (seededFloat(`${SEED}:q5skip:${vi}`) >= 0.10) {
      const locIdx = seededInt(`${SEED}:q5loc:${vi}`, 0, WRITE_IN_LOCATIONS.length - 1)
      voterRows.push({
        electionId: election.id, questionId: q5.id,
        optionId: null, rank: null, writeInText: WRITE_IN_LOCATIONS[locIdx],
        ballotId, weight: 1,
      })
    }

    // Q6 — IRV RANKED_CHOICE required: ENGINEERED TIE
    // Even vi → [Pat, Robin]; odd vi → [Robin, Pat]
    // 868 voters → 434 even + 434 odd → exactly 434/434 first-choice → full IRV tie
    const [q6First, q6Second] = vi % 2 === 0
      ? [q6Pat, q6Robin]
      : [q6Robin, q6Pat]
    voterRows.push({ electionId: election.id, questionId: q6.id, optionId: q6First.id,  rank: 1, writeInText: null, ballotId, weight: 1 })
    voterRows.push({ electionId: election.id, questionId: q6.id, optionId: q6Second.id, rank: 2, writeInText: null, ballotId, weight: 1 })

    // Q7 — SINGLE_CHOICE required: ENGINEERED TOP-TWO TIE
    // vi < q7Decoy (172) → Lee; others parity-split Alex/Sam → Alex==Sam==348, Lee==172
    let q7Vote: typeof q7Alex
    if (vi < q7Decoy) {
      q7Vote = q7Lee
    } else {
      q7Vote = (vi - q7Decoy) % 2 === 0 ? q7Alex : q7Sam
    }
    voterRows.push({ electionId: election.id, questionId: q7.id, optionId: q7Vote.id, rank: null, writeInText: null, ballotId, weight: 1 })

    // Q8 — MULTIPLE_CHOICE required: ENGINEERED TOP TIE
    // Every voter picks Bylaw A + B → A==B==868 (tied top)
    // Bylaw C on vi%2==0 (434), Bylaw D on vi%3==0 (290) — trailing distinct counts
    voterRows.push({ electionId: election.id, questionId: q8.id, optionId: q8BylawA.id, rank: null, writeInText: null, ballotId, weight: 1 })
    voterRows.push({ electionId: election.id, questionId: q8.id, optionId: q8BylawB.id, rank: null, writeInText: null, ballotId, weight: 1 })
    if (vi % 2 === 0) voterRows.push({ electionId: election.id, questionId: q8.id, optionId: q8BylawC.id, rank: null, writeInText: null, ballotId, weight: 1 })
    if (vi % 3 === 0) voterRows.push({ electionId: election.id, questionId: q8.id, optionId: q8BylawD.id, rank: null, writeInText: null, ballotId, weight: 1 })

    // Q9 — COMMENT optional: skip ~10%; draws from improvement-response phrase list
    if (seededFloat(`${SEED}:q9skip:${vi}`) >= 0.10) {
      const impIdx = seededInt(`${SEED}:q9imp:${vi}`, 0, IMPROVE_RESPONSES.length - 1)
      voterRows.push({
        electionId: election.id, questionId: q9.id,
        optionId: null, rank: null, writeInText: IMPROVE_RESPONSES[impIdx],
        ballotId, weight: 1,
      })
    }

    // Compute ballot hash exactly as the real vote handler does
    const receiptCode = generateReceiptCode()
    const ballotHash = computeBallotHash(
      voterRows.map((v) => ({
        questionId: v.questionId,
        optionId: v.optionId,
        rank: v.rank,
        writeInText: v.writeInText,
        weight: v.weight,
      })),
    )
    allReceiptData.push({ electionId: election.id, receiptCode, ballotHash })
    if (sampleReceipts.length < 5) sampleReceipts.push({ voterName: voter.name, receiptCode })

    allVoteRows.push(...voterRows)
  }

  // ── 7. Persist votes in chunks (avoids Postgres 65,535 bind-param limit) ───
  for (let i = 0; i < allVoteRows.length; i += VOTE_CHUNK) {
    await db.vote.createMany({ data: allVoteRows.slice(i, i + VOTE_CHUNK) })
  }
  await db.ballotReceipt.createMany({ data: allReceiptData })

  // ── 8. Mark voting voters as voted; set firstVoteAt ───────────────────────
  await db.voter.updateMany({
    where: { electionId: election.id, id: { in: [...votingIds] } },
    data: { hasVoted: true, votedAt: now },
  })
  await db.election.update({ where: { id: election.id }, data: { firstVoteAt: now } })

  // ── 9. Complete the election ───────────────────────────────────────────────
  const allVotes = await db.vote.findMany({ where: { electionId: election.id } })
  const tallyHash = computeTallyHash(allVotes)
  await db.election.update({
    where: { id: election.id },
    data: { status: "COMPLETED", endsAt: now, tallyHash, tallyHashSetAt: now },
  })

  // ── 10. Seed activity log for audit-trail testing ─────────────────────────
  // Writes representative SYSTEM entries so /elections/<id>/activity isn't blank.
  const activatedAt = new Date(now.getTime() - 60 * 60 * 1000)
  await recordActivity({ system: true, action: "election.create",   electionId: election.id, targetType: "election", targetId: election.id, targetLabel: DEMO_TITLE, metadata: { note: "Seeded by test/seed-demo" } })
  await recordActivity({ system: true, action: "election.activate", electionId: election.id, targetType: "election", targetId: election.id, targetLabel: DEMO_TITLE, metadata: { activatedAt: activatedAt.toISOString(), voterCount: VOTER_COUNT } })
  await recordActivity({ system: true, action: "voter.bulk_invite", electionId: election.id, targetType: "voter",    targetId: null, targetLabel: null, metadata: { count: VOTER_COUNT, note: "No emails sent (test.invalid addresses)" } })
  await recordActivity({ system: true, action: "election.close",    electionId: election.id, targetType: "election", targetId: election.id, targetLabel: DEMO_TITLE, metadata: { voted: VOTING_COUNT, total: VOTER_COUNT } })
  await recordActivity({ system: true, action: "election.finalize", electionId: election.id, targetType: "election", targetId: election.id, targetLabel: DEMO_TITLE, metadata: { tallyHash: `sha256:${tallyHash}`, voteRows: allVoteRows.length } })

  // ── 11. Self-check — prove hash determinism and receipt integrity ───────────
  // Re-query votes in a DIFFERENT order (matches audit export path ORDER BY questionId)
  // to confirm the total-order sort fix holds at scale with 1,000 voters
  const votesReordered = await db.vote.findMany({
    where: { electionId: election.id },
    orderBy: [{ questionId: "asc" }],
  })
  const tallyHashRecomputed = computeTallyHash(votesReordered)
  const hashMatch = tallyHashRecomputed === tallyHash

  // Recompute every ballot hash from DB rows and verify against stored receipts
  const storedReceipts = await db.ballotReceipt.findMany({ where: { electionId: election.id } })
  const receiptHashSet = new Set(storedReceipts.map((r) => r.ballotHash))
  const ballotGroups = new Map<string, typeof allVotes[0][]>()
  for (const v of allVotes) {
    if (!v.ballotId) continue
    if (!ballotGroups.has(v.ballotId)) ballotGroups.set(v.ballotId, [])
    ballotGroups.get(v.ballotId)!.push(v)
  }
  let receiptMismatches = 0
  for (const [, ballotVotes] of ballotGroups) {
    const recomputedHash = computeBallotHash(
      ballotVotes.map((v) => ({
        questionId: v.questionId,
        optionId: v.optionId,
        rank: v.rank,
        writeInText: v.writeInText,
        weight: v.weight,
      })),
    )
    if (!receiptHashSet.has(recomputedHash)) receiptMismatches++
  }
  const receiptsOk = receiptMismatches === 0

  // ── 12. Tally summaries for the response ───────────────────────────────────

  // Q0 — single-choice counts
  const q0NameById = new Map(q0Options.map((o) => [o.id, o.text]))
  const q0Counts: Record<string, number> = Object.fromEntries(q0Options.map((o) => [o.text, 0]))
  for (const v of allVotes.filter((v) => v.questionId === q0.id)) {
    const name = v.optionId ? (q0NameById.get(v.optionId) ?? v.optionId) : "(unknown)"
    q0Counts[name] = (q0Counts[name] ?? 0) + 1
  }

  // Q1 — multiple-choice counts
  const q1NameById = new Map(q1Options.map((o) => [o.id, o.text]))
  const q1Counts: Record<string, number> = Object.fromEntries(q1Options.map((o) => [o.text, 0]))
  for (const v of allVotes.filter((v) => v.questionId === q1.id)) {
    const name = v.optionId ? (q1NameById.get(v.optionId) ?? v.optionId) : "(unknown)"
    q1Counts[name] = (q1Counts[name] ?? 0) + 1
  }

  // Q2 — IRV
  const q2Votes = allVotes.filter((v) => v.questionId === q2.id)
  const q2Ballots = groupBallots(q2Votes.map((v) => ({ ballotId: v.ballotId, candidateId: v.optionId, rank: v.rank })))
  const q2NameById = new Map(q2Options.map((o) => [o.id, o.text]))
  const irvResult = runIRV(q2Ballots, q2Options.map((o) => o.id))
  const irvRounds = irvResult.rounds.map((r) => ({
    round: r.round,
    totalActive: r.totalActive,
    counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [q2NameById.get(id) ?? id, c])),
    eliminated: r.eliminated.map((id) => q2NameById.get(id) ?? id),
  }))

  // Q3 — STV
  const q3Votes = allVotes.filter((v) => v.questionId === q3.id)
  const q3Ballots = groupBallots(q3Votes.map((v) => ({ ballotId: v.ballotId, candidateId: v.optionId, rank: v.rank })))
  const q3NameById = new Map(q3Options.map((o) => [o.id, o.text]))
  const stvResult = runSTV(q3Ballots, q3Options.map((o) => o.id), 3)
  const stvRounds = stvResult.rounds.map((r) => ({
    round: r.round,
    quota: r.quota,
    counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [q3NameById.get(id) ?? id, c])),
    elected: r.elected.map((id) => q3NameById.get(id) ?? id),
    eliminated: r.eliminated.map((id) => q3NameById.get(id) ?? id),
  }))
  const stvExhaustedBallots = q3Ballots.filter((b) => b.length < q3Options.length).length

  // Q4 — optional single-choice counts
  const q4NameById = new Map(q4Options.map((o) => [o.id, o.text]))
  const q4Counts: Record<string, number> = Object.fromEntries(q4Options.map((o) => [o.text, 0]))
  for (const v of allVotes.filter((v) => v.questionId === q4.id)) {
    const name = v.optionId ? (q4NameById.get(v.optionId) ?? v.optionId) : "(unknown)"
    q4Counts[name] = (q4Counts[name] ?? 0) + 1
  }
  const q4Answered = Object.values(q4Counts).reduce((a, b) => a + b, 0)

  // Q5 — optional comment aggregation
  const q5Votes = allVotes.filter((v) => v.questionId === q5.id)
  const q5Tally: Record<string, number> = {}
  for (const v of q5Votes) {
    if (v.writeInText) q5Tally[v.writeInText] = (q5Tally[v.writeInText] ?? 0) + 1
  }

  // Q6 — tie verification
  const q6Votes = allVotes.filter((v) => v.questionId === q6.id)
  const q6Ballots = groupBallots(q6Votes.map((v) => ({ ballotId: v.ballotId, candidateId: v.optionId, rank: v.rank })))
  const q6NameById = new Map([[q6Pat.id, "Pat"], [q6Robin.id, "Robin"]])
  const q6IrvResult = runIRV(q6Ballots, [q6Pat.id, q6Robin.id])
  const q6FirstChoice: Record<string, number> = { Pat: 0, Robin: 0 }
  for (const b of q6Ballots) {
    if (b[0]) q6FirstChoice[q6NameById.get(b[0]) ?? b[0]] = (q6FirstChoice[q6NameById.get(b[0]) ?? b[0]] ?? 0) + 1
  }

  // Q7 — single-choice top-two tie counts
  const q7NameById = new Map([[q7Alex.id, "Alex"], [q7Sam.id, "Sam"], [q7Lee.id, "Lee"]])
  const q7Counts: Record<string, number> = { Alex: 0, Sam: 0, Lee: 0 }
  for (const v of allVotes.filter((v) => v.questionId === q7.id)) {
    const name = v.optionId ? (q7NameById.get(v.optionId) ?? v.optionId) : "(unknown)"
    q7Counts[name] = (q7Counts[name] ?? 0) + 1
  }
  const q7TopCount = Math.max(...Object.values(q7Counts))
  const q7TiedOptions = Object.entries(q7Counts).filter(([, c]) => c === q7TopCount).map(([n]) => n)
  const q7IsTie = q7TiedOptions.length > 1

  // Q8 — multiple-choice top tie counts
  const q8NameById = new Map([
    [q8BylawA.id, "Bylaw A"], [q8BylawB.id, "Bylaw B"],
    [q8BylawC.id, "Bylaw C"], [q8BylawD.id, "Bylaw D"],
  ])
  const q8Counts: Record<string, number> = { "Bylaw A": 0, "Bylaw B": 0, "Bylaw C": 0, "Bylaw D": 0 }
  for (const v of allVotes.filter((v) => v.questionId === q8.id)) {
    const name = v.optionId ? (q8NameById.get(v.optionId) ?? v.optionId) : "(unknown)"
    q8Counts[name] = (q8Counts[name] ?? 0) + 1
  }
  const q8TopCount = Math.max(...Object.values(q8Counts))
  const q8TiedOptions = Object.entries(q8Counts).filter(([, c]) => c === q8TopCount).map(([n]) => n)
  const q8IsTie = q8TiedOptions.length > 1

  // Q9 — optional comment aggregation
  const q9Votes = allVotes.filter((v) => v.questionId === q9.id)
  const q9Tally: Record<string, number> = {}
  for (const v of q9Votes) {
    if (v.writeInText) q9Tally[v.writeInText] = (q9Tally[v.writeInText] ?? 0) + 1
  }

  // Quorum
  const quorumRequired = Math.ceil(VOTER_COUNT * 50 / 100) // = 500
  const quorumMet = VOTING_COUNT >= quorumRequired

  // ── 13. Return audit report ────────────────────────────────────────────────
  return NextResponse.json({
    electionId: election.id,
    adminUrl: `/elections/${election.id}/results`,
    verifyUrl: `/verify/${election.id}`,
    message:
      "Demo election created and completed. Visit adminUrl for admin results + audit.json export. " +
      "Visit verifyUrl to test the voter-facing tally hash and receipt lookup. " +
      "Run DELETE to clean up when done.",

    selfCheck: {
      hashMatch,
      hashMatchLabel: hashMatch
        ? "YES ✓ — tally hash is identical regardless of DB query order (total-order sort verified at scale)"
        : "NO ✗ — FAIL: hash differs by query order — sort is not a total order",
      receiptsOk,
      receiptsLabel: receiptsOk
        ? `YES ✓ — all ${VOTING_COUNT} ballot hashes verified against stored receipts`
        : `NO ✗ — ${receiptMismatches} receipt hash mismatch(es) detected`,
      storedTallyHash: `sha256:${tallyHash}`,
      recomputedTallyHash: `sha256:${tallyHashRecomputed}`,
    },

    turnout: {
      totalVoters: VOTER_COUNT,
      voted: VOTING_COUNT,
      abstained: VOTER_COUNT - VOTING_COUNT,
      turnoutPct: `${((VOTING_COUNT / VOTER_COUNT) * 100).toFixed(1)}%`,
    },

    quorum: {
      type: "PERCENT",
      value: 50,
      required: quorumRequired,
      voted: VOTING_COUNT,
      met: quorumMet,
      label: quorumMet
        ? `YES ✓ — ${VOTING_COUNT} voted ≥ ${quorumRequired} required`
        : `NO ✗ — ${VOTING_COUNT} voted < ${quorumRequired} required`,
    },

    q0_singleChoice: {
      question: "Who should serve as President?",
      type: "SINGLE_CHOICE",
      required: true,
      totalVotes: VOTING_COUNT,
      counts: q0Counts,
      winner: Object.entries(q0Counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null,
    },

    q1_multipleChoice: {
      question: "Which initiatives should we fund? (choose up to 3)",
      type: "MULTIPLE_CHOICE",
      required: true,
      maxSelections: 3,
      totalSelections: Object.values(q1Counts).reduce((a, b) => a + b, 0),
      counts: q1Counts,
    },

    q2_irv: {
      question: "Elect the Chair (ranked — instant-runoff)",
      type: "RANKED_CHOICE",
      method: "IRV",
      seats: 1,
      totalBallots: q2Ballots.length,
      fullyRanked: q2Ballots.filter((b) => b.length === q2Options.length).length,
      partiallyRanked: q2Ballots.filter((b) => b.length < q2Options.length).length,
      rounds: irvRounds,
      winner: irvResult.winner ? (q2NameById.get(irvResult.winner) ?? irvResult.winner) : null,
      isTie: irvResult.isTie,
      verification: irvResult.isTie
        ? `⚠ TIE between ${irvResult.tiedOptions.map((id) => q2NameById.get(id) ?? id).join(", ")}`
        : `✓ Winner determined via IRV`,
    },

    q3_stv: {
      question: "Elect 3 Board Members (ranked — proportional)",
      type: "RANKED_CHOICE",
      method: "STV",
      seats: 3,
      totalBallots: q3Ballots.length,
      fullyRanked: q3Ballots.filter((b) => b.length === q3Options.length).length,
      partiallyRanked: q3Ballots.filter((b) => b.length < q3Options.length).length,
      exhaustedAtSomePoint: stvExhaustedBallots,
      initialDroopQuota: stvResult.quota,
      rounds: stvRounds,
      winners: stvResult.winners.map((id) => q3NameById.get(id) ?? id),
      seatsFilledCorrectly: stvResult.winners.length === 3,
      verification: stvResult.winners.length === 3
        ? `✓ Exactly 3 seats filled — no over-election`
        : `✗ FAIL — ${stvResult.winners.length} seats filled (expected 3)`,
    },

    q4_optionalSingleChoice: {
      question: "Should we adopt Amendment 2?",
      type: "SINGLE_CHOICE",
      required: false,
      answered: q4Answered,
      skipped: VOTING_COUNT - q4Answered,
      skipRate: `${(((VOTING_COUNT - q4Answered) / VOTING_COUNT) * 100).toFixed(1)}%`,
      counts: q4Counts,
    },

    q5_optionalComment: {
      question: "Suggest a future meeting location",
      type: "COMMENT",
      required: false,
      answered: q5Votes.length,
      skipped: VOTING_COUNT - q5Votes.length,
      skipRate: `${(((VOTING_COUNT - q5Votes.length) / VOTING_COUNT) * 100).toFixed(1)}%`,
      responses: q5Tally,
    },

    q6_rankedTie: {
      question: "Elect the Treasurer (tie-test — ranked)",
      type: "RANKED_CHOICE",
      method: "IRV",
      seats: 1,
      totalBallots: q6Ballots.length,
      firstChoiceCounts: q6FirstChoice,
      isTie: q6IrvResult.isTie,
      tiedOptions: q6IrvResult.tiedOptions.map((id) => q6NameById.get(id) ?? id),
      winner: q6IrvResult.winner,
      verification: q6IrvResult.isTie
        ? `✓ PASS — tie correctly detected between Pat and Robin (${VOTING_COUNT / 2}/${VOTING_COUNT / 2})`
        : `✗ FAIL — expected a tie but got winner: ${q6IrvResult.winner}`,
    },

    q7_singleChoiceTie: {
      question: "Who should serve as Vice President? (tie-test — single choice)",
      type: "SINGLE_CHOICE",
      required: true,
      counts: q7Counts,
      topCount: q7TopCount,
      tiedOptions: q7TiedOptions,
      isTie: q7IsTie,
      decoyVotes: q7Decoy,
      verification: q7IsTie && q7TiedOptions.includes("Alex") && q7TiedOptions.includes("Sam")
        ? `✓ PASS — tie correctly detected between Alex and Sam (${(VOTING_COUNT - q7Decoy) / 2} each), Lee trailing (${q7Decoy})`
        : `✗ FAIL — expected Alex/Sam tie, got: ${JSON.stringify(q7TiedOptions)}`,
    },

    q8_multipleChoiceTie: {
      question: "Which bylaw amendments do you approve? (tie-test)",
      type: "MULTIPLE_CHOICE",
      required: true,
      counts: q8Counts,
      topCount: q8TopCount,
      tiedOptions: q8TiedOptions,
      isTie: q8IsTie,
      verification: q8IsTie && q8TiedOptions.includes("Bylaw A") && q8TiedOptions.includes("Bylaw B")
        ? `✓ PASS — tie correctly detected: Bylaw A and Bylaw B each at ${q8TopCount} votes (== VOTING_COUNT)`
        : `✗ FAIL — expected Bylaw A/B tie, got: ${JSON.stringify(q8TiedOptions)}`,
    },

    q9_optionalComment: {
      question: "Name one thing we should improve next year",
      type: "COMMENT",
      required: false,
      answered: q9Votes.length,
      skipped: VOTING_COUNT - q9Votes.length,
      skipRate: `${(((VOTING_COUNT - q9Votes.length) / VOTING_COUNT) * 100).toFixed(1)}%`,
      responses: q9Tally,
    },

    sampleReceiptCodes: sampleReceipts,
    nextSteps: [
      `1. Admin results UI:       ${"/elections/" + election.id + "/results"}`,
      `2. Voter verify page:      ${"/verify/" + election.id}`,
      `3. Enter a sampleReceiptCode on the verify page to confirm ballot-level receipt lookup`,
      `4. Admin activity log:     ${"/elections/" + election.id + "/activity"}`,
      `5. Export audit.json from the results page; recompute SHA-256 over the 'votes' array and confirm it matches tallyHash`,
      `6. Check that Q6/Q7/Q8 each show a tie in both the UI and audit.json`,
      `7. Confirm ${VOTER_COUNT - VOTING_COUNT} voters show as abstained in the voter list`,
      `8. DELETE: curl -X DELETE -H 'Authorization: Bearer <secret>' <host>/api/test/seed-demo`,
    ],
    seed: SEED,
    totalVoteRows: allVoteRows.length,
    questionCount: 10,
    coverage: {
      SINGLE_CHOICE: "Q0 (clean winner), Q4 (optional, no tie), Q7 (engineered top-two tie)",
      MULTIPLE_CHOICE: "Q1 (clean, maxSelections:3), Q8 (engineered top tie)",
      RANKED_CHOICE: "Q2 (IRV clean), Q3 (STV 3-seat clean), Q6 (IRV engineered tie)",
      COMMENT: "Q5 (optional, location), Q9 (optional, improvement — no tie applicable)",
    },
  })
}

// ─── DELETE — clean up the demo election ─────────────────────────────────────

export async function DELETE(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await db.election.deleteMany({ where: { title: DEMO_TITLE } })
  return NextResponse.json({
    ok: true,
    deleted: result.count,
    message: result.count > 0 ? "Demo election deleted." : "No demo election found to delete.",
  })
}
