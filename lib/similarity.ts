/** Canonical similarity threshold for "did you mean" hints (tunable). */
export const SIMILARITY_THRESHOLD = 0.82

/** Lowercase, trim, collapse internal whitespace to a single space. */
export function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ")
}

/** Levenshtein edit distance (two-row DP). */
function levenshtein(a: string, b: string): number {
  if (a.length < b.length) return levenshtein(b, a)
  if (b.length === 0) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = curr
  }
  return prev[b.length]
}

/** Normalized Levenshtein similarity in [0, 1]: 1 − dist / max(|a|, |b|). */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

/** Jaro similarity (transposition-aware). */
function jaro(a: string, b: string): number {
  if (a === b) return 1
  const matchDist = Math.floor(Math.max(a.length, b.length) / 2) - 1
  if (matchDist < 0) return 0
  const aMatches = new Array(a.length).fill(false)
  const bMatches = new Array(b.length).fill(false)
  let matches = 0
  let transpositions = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDist)
    const end = Math.min(i + matchDist + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  return (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
}

/** Jaro-Winkler similarity in [0, 1] (prefix boost, p = 0.1). */
export function jaroWinkler(a: string, b: string): number {
  const sim = jaro(a, b)
  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] !== b[i]) break
    prefix++
  }
  return sim + prefix * 0.1 * (1 - sim)
}

/** Similarity of two already-normalized single tokens (no further normalization). */
function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1
  return Math.max(levenshteinSimilarity(a, b), jaroWinkler(a, b))
}

/**
 * Combined similarity of two display names.
 *
 * For multi-token names (e.g. "First Last"), tokens are aligned from the right
 * (surname-last convention) and the MINIMUM per-token similarity is returned.
 * This prevents false matches where only the first name is shared — e.g.
 * "Chris Dewald" vs "Chris Daniels" scores low because the last names differ,
 * while "Christopher Dewald" vs "Chris Dewald" scores high because both tokens match.
 *
 * For single-token names, direct string similarity is used.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return 1

  const aToks = na.split(" ").filter(Boolean)
  const bToks = nb.split(" ").filter(Boolean)

  if (aToks.length === 1 || bToks.length === 1) {
    return Math.max(levenshteinSimilarity(na, nb), jaroWinkler(na, nb))
  }

  // Align from the right and take the worst-matching token pair.
  // Both names must be similar in ALL parts, not just on average.
  const n = Math.min(aToks.length, bToks.length)
  let minSim = 1
  for (let i = 0; i < n; i++) {
    const ta = aToks[aToks.length - n + i]
    const tb = bToks[bToks.length - n + i]
    minSim = Math.min(minSim, tokenSimilarity(ta, tb))
  }
  return minSim
}

export interface Suggestion {
  value: string
  score: number
  /** True when normalized forms are identical (only casing/whitespace differ). */
  exact: boolean
}

/**
 * Rank `candidates` against `query` using token-aware name similarity.
 * Returns candidates with score >= threshold (default: SIMILARITY_THRESHOLD),
 * sorted by score descending, capped at `limit` (default: 5).
 */
export function bestMatches(
  query: string,
  candidates: string[],
  opts?: { threshold?: number; limit?: number }
): Suggestion[] {
  const threshold = opts?.threshold ?? SIMILARITY_THRESHOLD
  const limit = opts?.limit ?? 5
  const nq = normalizeName(query)
  return candidates
    .map((c) => {
      const exact = normalizeName(c) === nq
      const score = exact ? 1 : nameSimilarity(query, c)
      return { value: c, score, exact }
    })
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
