/**
 * Smoke tests for lib/similarity.ts
 * Run with: npx tsx lib/similarity.test.ts
 */
import assert from "node:assert/strict"
import { normalizeName, nameSimilarity, bestMatches, SIMILARITY_THRESHOLD } from "./similarity.js"

// --- normalizeName ---
assert.equal(normalizeName("  Chris   Dewald "), "chris dewald", "normalizeName: collapse whitespace")
assert.equal(normalizeName("CHRIS DEWALD"), "chris dewald", "normalizeName: lowercase")
assert.equal(normalizeName("Chris Dewald"), "chris dewald", "normalizeName: basic")

// --- nameSimilarity (should match) ---
const christopherVsChris = nameSimilarity("Christopher Dewald", "Chris Dewald")
assert.ok(
  christopherVsChris >= SIMILARITY_THRESHOLD,
  `Christopher↔Chris Dewald should be >= ${SIMILARITY_THRESHOLD}, got ${christopherVsChris.toFixed(3)}`
)

assert.equal(nameSimilarity("Chris Dewald", "Chris Dewald"), 1, "exact match → 1")
assert.equal(nameSimilarity("chris dewald", "Chris Dewald"), 1, "casing only → 1 (normalized)")

const jonVsJohn = nameSimilarity("Jon Smith", "John Smith")
assert.ok(
  jonVsJohn >= SIMILARITY_THRESHOLD,
  `Jon↔John Smith should be >= ${SIMILARITY_THRESHOLD}, got ${jonVsJohn.toFixed(3)}`
)

// --- nameSimilarity (should NOT match — different last names) ---
const chrisVsDaniels = nameSimilarity("Chris Dewald", "Chris Daniels")
assert.ok(
  chrisVsDaniels < SIMILARITY_THRESHOLD,
  `Chris Dewald↔Chris Daniels should be < ${SIMILARITY_THRESHOLD}, got ${chrisVsDaniels.toFixed(3)}`
)

const jonVsJane = nameSimilarity("Jon Smith", "Jane Smith")
assert.ok(
  jonVsJane < SIMILARITY_THRESHOLD,
  `Jon↔Jane Smith should be < ${SIMILARITY_THRESHOLD}, got ${jonVsJane.toFixed(3)}`
)

// --- bestMatches ---
const matches = bestMatches("christopher dewald", ["Chris Dewald", "Jane Roe", "Bob Jones"])
assert.ok(matches.length > 0, "should find at least one match")
assert.equal(matches[0].value, "Chris Dewald", "top match should be Chris Dewald")
assert.ok(matches[0].score >= SIMILARITY_THRESHOLD, "top match score should be above threshold")

// exact casing match
const exact = bestMatches("chris dewald", ["Chris Dewald", "Jane Roe"])
assert.ok(exact.length > 0, "should find exact match")
assert.equal(exact[0].exact, true, "should flag as exact (normalized equal)")
assert.equal(exact[0].value, "Chris Dewald", "exact match value")

// no match for garbage
const noMatch = bestMatches("xyzzy", ["Chris Dewald", "Jane Roe"])
assert.equal(noMatch.length, 0, "should find no match for garbage input")

// different-last-name candidates should not appear as suggestions
const chrisCandidates = bestMatches("chris dewald", ["Chris Daniels", "Christine Waters"])
assert.equal(
  chrisCandidates.filter((s) => s.value === "Chris Daniels").length,
  0,
  "Chris Daniels should not be suggested for Chris Dewald"
)

console.log("✓ All similarity tests passed")
