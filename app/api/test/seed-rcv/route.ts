export const runtime = "nodejs"

/**
 * RCV algorithm test route — creates a demo election with 50 seeded ballots
 * and returns a full audit report for verifying IRV (single-seat) and STV
 * (multi-seat) correctness.
 *
 * Gated by Authorization: Bearer <CRON_SECRET>
 * GET    — create demo, cast votes, return audit report
 * DELETE — remove demo election
 *
 * No emails are sent at any point.
 */

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateVoterToken } from "@/lib/voterToken"
import { computeTallyHash, generateBallotId } from "@/lib/verification"
import { groupBallots, runIRV, runSTV } from "@/lib/tally/rankedChoice"

const DEMO_TITLE = "[RCV Demo] IRV + STV Test — Do Not Use"
const SEED_BASE = "rcv-test-2025"

// ─── Deterministic PRNG (same FNV-1a + mulberry32 used in BallotForm) ────────

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

// ─── Auth helper ─────────────────────────────────────────────────────────────

function checkAuth(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? ""
  // Accept CRON_SECRET if set, otherwise fall back to NEXTAUTH_SECRET for local dev
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET || ""
  return !!secret && auth === `Bearer ${secret}`
}

// ─── GET — run the full test ──────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized — pass Authorization: Bearer <CRON_SECRET>" }, { status: 401 })

  const url = new URL(req.url)
  const voterCount = Math.min(5000, Math.max(2, parseInt(url.searchParams.get("voters") ?? "50", 10) || 50))
  const seed = url.searchParams.get("seed") ?? `rcv-test-${voterCount}`

  const now = new Date()

  // Clean up any leftover from a prior run
  await db.election.deleteMany({ where: { title: DEMO_TITLE } })

  // ── 1. Create election (ACTIVE, window open) ──────────────────────────────
  const election = await db.election.create({
    data: {
      title: DEMO_TITLE,
      description: "Automated RCV algorithm test. Safe to archive and delete.",
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      endsAt: new Date(now.getTime() + 60 * 60 * 1000),   // 1 hour from now
      activatedAt: new Date(now.getTime() - 60 * 60 * 1000),
      autoActivate: false,
      autoSendResults: false,
    },
  })

  // ── 2. Question 1 — Single-seat IRV (5 candidates) ────────────────────────
  const q1Candidates = ["Alice", "Bob", "Carol", "David", "Eve"]
  const q1 = await db.question.create({
    data: {
      electionId: election.id,
      text: "Elect a President (Single Seat — IRV)",
      type: "RANKED_CHOICE",
      order: 0,
      required: true,
      seats: 1,
    },
  })
  const q1Options = await Promise.all(
    q1Candidates.map((name, i) =>
      db.option.create({ data: { questionId: q1.id, text: name, order: i } })
    )
  )
  const q1NameById = new Map(q1Options.map((o) => [o.id, o.text]))

  // ── 3. Question 2 — Multi-seat STV, 3 seats (6 candidates) ───────────────
  const q2Candidates = ["Frank", "Grace", "Henry", "Iris", "Jack", "Kate"]
  const q2 = await db.question.create({
    data: {
      electionId: election.id,
      text: "Elect 3 Board Members (Multi-Seat — STV)",
      type: "RANKED_CHOICE",
      order: 1,
      required: true,
      seats: 3,
    },
  })
  const q2Options = await Promise.all(
    q2Candidates.map((name, i) =>
      db.option.create({ data: { questionId: q2.id, text: name, order: i } })
    )
  )
  const q2NameById = new Map(q2Options.map((o) => [o.id, o.text]))

  // ── 4. Create 50 voters (no invitedAt → no emails ever fire) ─────────────
  await db.voter.createMany({
    data: Array.from({ length: voterCount }, (_, i) => ({
      electionId: election.id,
      name: `Test Voter ${String(i + 1).padStart(3, "0")}`,
      email: `voter${String(i + 1).padStart(3, "0")}@test.invalid`,
    })),
  })
  const voters = await db.voter.findMany({
    where: { electionId: election.id },
    orderBy: { name: "asc" },
  })

  // ── 5. Generate tokens (stored but never emailed) ─────────────────────────
  for (const voter of voters) {
    const { tokenHash } = generateVoterToken()
    await db.voterTokenHistory.create({ data: { voterId: voter.id, tokenHash } })
  }

  // ── 6. Cast all 50 ballots with seeded-random rankings ────────────────────
  const voteRows: {
    electionId: string
    questionId: string
    optionId: string
    rank: number
    ballotId: string
    weight: number
  }[] = []

  const rawBallots: Array<{
    voterIndex: number
    q1Ranking: string[]
    q2Ranking: string[]
  }> = []

  for (let i = 0; i < voters.length; i++) {
    const ballotId = generateBallotId()

    const q1Shuffled = seededShuffle(q1Options, `${seed}:q1:${i}`)
    const q2Shuffled = seededShuffle(q2Options, `${seed}:q2:${i}`)

    q1Shuffled.forEach((opt, rank) => {
      voteRows.push({ electionId: election.id, questionId: q1.id, optionId: opt.id, rank: rank + 1, ballotId, weight: 1 })
    })
    q2Shuffled.forEach((opt, rank) => {
      voteRows.push({ electionId: election.id, questionId: q2.id, optionId: opt.id, rank: rank + 1, ballotId, weight: 1 })
    })

    rawBallots.push({
      voterIndex: i + 1,
      q1Ranking: q1Shuffled.map((o) => o.text),
      q2Ranking: q2Shuffled.map((o) => o.text),
    })
  }

  await db.vote.createMany({ data: voteRows })

  await db.voter.updateMany({
    where: { electionId: election.id },
    data: { hasVoted: true, votedAt: now },
  })
  await db.election.update({
    where: { id: election.id },
    data: { firstVoteAt: now },
  })

  // ── 7. Complete the election ──────────────────────────────────────────────
  const allVotes = await db.vote.findMany({ where: { electionId: election.id } })
  const tallyHash = computeTallyHash(allVotes)
  await db.election.update({
    where: { id: election.id },
    data: {
      status: "COMPLETED",
      endsAt: now,
      tallyHash,
      tallyHashSetAt: now,
    },
  })

  // ── 8. Run IRV on Q1 ──────────────────────────────────────────────────────
  const q1Votes = allVotes.filter((v) => v.questionId === q1.id)
  const q1Ballots = groupBallots(q1Votes.map((v) => ({ ballotId: v.ballotId, optionId: v.optionId, rank: v.rank })))
  const irvResult = runIRV(q1Ballots, q1Options.map((o) => o.id))

  // First-choice counts by name
  const q1FirstChoice: Record<string, number> = Object.fromEntries(q1Candidates.map((n) => [n, 0]))
  for (const ballot of q1Ballots) {
    const name = q1NameById.get(ballot[0]) ?? ballot[0]
    q1FirstChoice[name] = (q1FirstChoice[name] ?? 0) + 1
  }

  // Translate round IDs → names
  const irvRoundsNamed = irvResult.rounds.map((r) => ({
    round: r.round,
    totalActive: r.totalActive,
    counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [q1NameById.get(id) ?? id, c])),
    eliminated: r.eliminated.map((id) => q1NameById.get(id) ?? id),
  }))

  const irvWinner = irvResult.winner ? (q1NameById.get(irvResult.winner) ?? irvResult.winner) : null
  const irvTied = irvResult.tiedOptions.map((id) => q1NameById.get(id) ?? id)

  const finalIrvRound = irvRoundsNamed.at(-1)
  const winnerVotes = irvWinner && finalIrvRound ? (finalIrvRound.counts[irvWinner] ?? 0) : 0
  const activeInFinal = finalIrvRound?.totalActive ?? 0
  const hasMajority = winnerVotes * 2 > activeInFinal

  const irvVerification = irvResult.isTie
    ? `⚠ Tie between: ${irvTied.join(", ")}`
    : `✓ Winner "${irvWinner}" has ${winnerVotes}/${activeInFinal} active ballots (${((winnerVotes / (activeInFinal || 1)) * 100).toFixed(1)}%) — majority required >50%: ${hasMajority ? "✓ PASS" : "✗ FAIL"}`

  // ── 9. Run STV on Q2 ──────────────────────────────────────────────────────
  const q2Votes = allVotes.filter((v) => v.questionId === q2.id)
  const q2Ballots = groupBallots(q2Votes.map((v) => ({ ballotId: v.ballotId, optionId: v.optionId, rank: v.rank })))
  const seats = 3
  const droopQuota = Math.floor(q2Ballots.length / (seats + 1)) + 1
  const stvResult = runSTV(q2Ballots, q2Options.map((o) => o.id), seats)

  const q2FirstChoice: Record<string, number> = Object.fromEntries(q2Candidates.map((n) => [n, 0]))
  for (const ballot of q2Ballots) {
    const name = q2NameById.get(ballot[0]) ?? ballot[0]
    q2FirstChoice[name] = (q2FirstChoice[name] ?? 0) + 1
  }

  const stvRoundsNamed = stvResult.rounds.map((r) => ({
    round: r.round,
    quota: r.quota,
    counts: Object.fromEntries(Object.entries(r.counts).map(([id, c]) => [q2NameById.get(id) ?? id, c])),
    elected: r.elected.map((id) => q2NameById.get(id) ?? id),
    eliminated: r.eliminated.map((id) => q2NameById.get(id) ?? id),
  }))

  const stvWinners = stvResult.winners.map((id) => q2NameById.get(id) ?? id)
  const q2FirstSum = Object.values(q2FirstChoice).reduce((a, b) => a + b, 0)
  const stvSeatsCorrect = stvWinners.length === seats

  const stvVerification = [
    `Seats filled: ${stvWinners.length}/${seats} — ${stvSeatsCorrect ? "✓ PASS (over-election bug fix verified)" : "✗ FAIL (still over-electing!)"}`,
    `Droop quota: ⌊${q2Ballots.length}/(${seats}+1)⌋+1 = ${droopQuota}`,
    `First-choice sum: ${q2FirstSum}/${q2Ballots.length} — ${q2FirstSum === q2Ballots.length ? "✓ PASS" : "✗ FAIL"}`,
  ].join("  |  ")

  // ── 10. Return the full audit report ─────────────────────────────────────
  return NextResponse.json({
    electionId: election.id,
    adminUrl: `/elections/${election.id}/results`,
    message: "Demo election created and completed. Visit adminUrl in the VoteHost UI to see results visually. Run DELETE to clean up.",

    ballotSummary: {
      totalVoters: voterCount,
      votedCount: voterCount,
      turnout: "100%",
      totalVoteRows: voteRows.length,
      tallyHash: `sha256:${tallyHash}`,
      seed,
    },

    q1_irv: {
      question: "Elect a President (Single Seat — IRV)",
      candidates: q1Candidates,
      seats: 1,
      totalBallots: q1Ballots.length,
      firstChoiceCounts: q1FirstChoice,
      firstChoiceSum: Object.values(q1FirstChoice).reduce((a, b) => a + b, 0),
      rounds: irvRoundsNamed,
      winner: irvWinner,
      isTie: irvResult.isTie,
      tiedOptions: irvTied,
      verification: irvVerification,
    },

    q2_stv: {
      question: "Elect 3 Board Members (Multi-Seat — STV)",
      candidates: q2Candidates,
      seats,
      droopQuota,
      totalBallots: q2Ballots.length,
      firstChoiceCounts: q2FirstChoice,
      firstChoiceSum: q2FirstSum,
      rounds: stvRoundsNamed,
      winners: stvWinners,
      verification: stvVerification,
    },

    rawBallots,
  })
}

// ─── DELETE — clean up the demo election ────────────────────────────────────

export async function DELETE(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await db.election.deleteMany({ where: { title: DEMO_TITLE } })
  return NextResponse.json({ ok: true, deleted: result.count, message: result.count > 0 ? "Demo election deleted." : "No demo election found to delete." })
}
