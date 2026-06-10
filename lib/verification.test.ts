/**
 * Smoke tests for lib/verification.ts
 * Run with: npx tsx lib/verification.test.ts
 */
import assert from "node:assert/strict"
import { normalizeReceiptCode, findBallotIdByHash, computeBallotHash } from "./verification.js"

// --- normalizeReceiptCode ---

assert.equal(
  normalizeReceiptCode("ABCD-EFGH-IJKL-MNOP"),
  "ABCD-EFGH-IJKL-MNOP",
  "normalizeReceiptCode: already normalized"
)
assert.equal(
  normalizeReceiptCode("abcdefghijklmnop"),
  "ABCD-EFGH-IJKL-MNOP",
  "normalizeReceiptCode: lowercase with no dashes"
)
assert.equal(
  normalizeReceiptCode("ABCD EFGH IJKL MNOP"),
  "ABCD-EFGH-IJKL-MNOP",
  "normalizeReceiptCode: spaces instead of dashes"
)
assert.equal(
  normalizeReceiptCode("abcd-efgh-ijkl-mno"),
  "",
  "normalizeReceiptCode: too short → empty string"
)
assert.equal(
  normalizeReceiptCode("garbage!!!"),
  "",
  "normalizeReceiptCode: invalid characters → empty string"
)
assert.equal(
  normalizeReceiptCode(""),
  "",
  "normalizeReceiptCode: empty input → empty string"
)

// --- findBallotIdByHash ---

const rowsA = [
  { ballotId: "ballot-1", questionId: "q1", optionId: "opt-a", rank: null, writeInText: null, weight: 1 },
  { ballotId: "ballot-1", questionId: "q2", optionId: null, rank: null, writeInText: "Alice", weight: 1 },
]
const rowsB = [
  { ballotId: "ballot-2", questionId: "q1", optionId: "opt-b", rank: null, writeInText: null, weight: 1 },
  { ballotId: "ballot-2", questionId: "q2", optionId: null, rank: null, writeInText: "Bob", weight: 1 },
]
const allRows = [...rowsA, ...rowsB]

const hashA = computeBallotHash(rowsA.map((r) => ({
  questionId: r.questionId,
  optionId: r.optionId,
  rank: r.rank,
  writeInText: r.writeInText,
  weight: r.weight,
})))
const hashB = computeBallotHash(rowsB.map((r) => ({
  questionId: r.questionId,
  optionId: r.optionId,
  rank: r.rank,
  writeInText: r.writeInText,
  weight: r.weight,
})))

// exact match — finds ballot A
assert.equal(
  findBallotIdByHash(allRows, hashA),
  "ballot-1",
  "findBallotIdByHash: finds ballot-1 by its hash"
)

// exact match — finds ballot B
assert.equal(
  findBallotIdByHash(allRows, hashB),
  "ballot-2",
  "findBallotIdByHash: finds ballot-2 by its hash"
)

// no match — returns null
assert.equal(
  findBallotIdByHash(allRows, "0000000000000000000000000000000000000000000000000000000000000000"),
  null,
  "findBallotIdByHash: returns null for unknown hash"
)

// two content-identical ballots — either id is acceptable
const rowsC = rowsA.map((r) => ({ ...r, ballotId: "ballot-3" }))
const allRowsWithDupe = [...rowsA, ...rowsC]
const result = findBallotIdByHash(allRowsWithDupe, hashA)
assert.ok(
  result === "ballot-1" || result === "ballot-3",
  `findBallotIdByHash: content-identical ballots, got ${result}, expected ballot-1 or ballot-3`
)

console.log("✓ All verification tests passed")
