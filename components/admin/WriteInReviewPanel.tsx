"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MergeCombobox } from "@/components/ui/combobox"
import { bestMatches, SIMILARITY_THRESHOLD, normalizeName } from "@/lib/similarity"

interface Entry {
  rawText: string
  count: number
  canonicalLabel: string | null
}

interface ListedOption {
  id: string
  text: string
}

interface QuestionData {
  questionId: string
  questionText: string
  totalResponses: number
  options: ListedOption[]
  entries: Entry[]
}

interface Props {
  electionId: string
  questions: QuestionData[]
  autoSendResults: boolean
}

export default function WriteInReviewPanel({ electionId, questions, autoSendResults }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Local merge state: questionId → rawText → canonicalLabel (null = no merge)
  const [merges, setMerges] = useState<Record<string, Record<string, string | null>>>(() => {
    const init: Record<string, Record<string, string | null>> = {}
    for (const q of questions) {
      init[q.questionId] = {}
      for (const e of q.entries) {
        init[q.questionId][e.rawText] = e.canonicalLabel
      }
    }
    return init
  })

  // Per-entry working draft (what's in the input field before save)
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {}
    for (const q of questions) {
      init[q.questionId] = {}
      for (const e of q.entries) {
        init[q.questionId][e.rawText] = e.canonicalLabel ?? ""
      }
    }
    return init
  })

  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [error, setError] = useState("")

  function draftKey(questionId: string, rawText: string) {
    return `${questionId}:::${rawText}`
  }

  function getDraft(questionId: string, rawText: string): string {
    return drafts[questionId]?.[rawText] ?? ""
  }

  function setDraft(questionId: string, rawText: string, value: string) {
    setDrafts((d) => ({
      ...d,
      [questionId]: { ...d[questionId], [rawText]: value },
    }))
  }

  async function saveMerge(questionId: string, rawText: string, valueOverride?: string) {
    const canonical = (valueOverride ?? (getDraft(questionId, rawText) || rawText)).trim()
    const key = draftKey(questionId, rawText)
    setSaving((s) => ({ ...s, [key]: true }))
    try {
      const res = await fetch(`/api/elections/${electionId}/writein-merges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, rawTexts: [rawText], canonicalLabel: canonical }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMerges((m) => ({
        ...m,
        [questionId]: { ...m[questionId], [rawText]: canonical },
      }))
    } catch {
      setError("Save failed — check your connection and try again.")
    } finally {
      setSaving((s) => ({ ...s, [key]: false }))
    }
  }

  async function removeMerge(questionId: string, rawText: string) {
    const key = draftKey(questionId, rawText)
    setSaving((s) => ({ ...s, [key]: true }))
    try {
      const res = await fetch(`/api/elections/${electionId}/writein-merges`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, rawText }),
      })
      if (!res.ok) throw new Error(await res.text())
      setMerges((m) => ({
        ...m,
        [questionId]: { ...m[questionId], [rawText]: null },
      }))
      setDraft(questionId, rawText, "")
    } catch {
      setError("Remove failed — check your connection and try again.")
    } finally {
      setSaving((s) => ({ ...s, [key]: false }))
    }
  }

  /** Copy the raw write-in text into the merge box so the admin can review and save. */
  function quickFill(questionId: string, rawText: string) {
    setDraft(questionId, rawText, rawText)
  }

  /** Set the draft to a suggested canonical label and immediately persist it. */
  async function applySuggestion(questionId: string, rawText: string, value: string) {
    setDraft(questionId, rawText, value)
    await saveMerge(questionId, rawText, value)
  }

  async function handleFinalize() {
    setFinalizing(true)
    setError("")
    try {
      const res = await fetch(`/api/elections/${electionId}/finalize`, { method: "POST" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? "Finalize failed")
      }
      startTransition(() => router.push(`/elections/${electionId}/results`))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed — try again.")
      setFinalizing(false)
    }
  }

  /**
   * Build the suggestion pool for a question: listed candidate names +
   * already-decided canonical labels in this review session.
   * Deduped by normalized form to avoid near-duplicate suggestions.
   */
  const questionPools = useMemo(() => {
    const pools: Record<string, string[]> = {}
    for (const q of questions) {
      const map = new Map<string, string>() // normalized → original (preserve casing)
      for (const opt of q.options) {
        const norm = normalizeName(opt.text)
        if (!map.has(norm)) map.set(norm, opt.text)
      }
      for (const [, canonical] of Object.entries(merges[q.questionId] ?? {})) {
        if (canonical) {
          const norm = normalizeName(canonical)
          if (!map.has(norm)) map.set(norm, canonical)
        }
      }
      pools[q.questionId] = [...map.values()]
    }
    return pools
  }, [questions, merges])

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          className="px-4 py-3 rounded-[10px] text-sm"
          style={{ background: "oklch(0.98 0.012 15)", border: "1px solid var(--vh-danger)", color: "var(--vh-danger)" }}
        >
          {error}
        </div>
      )}

      {questions.map((q) => {
        const listedOptionTexts = new Set(q.options.map((o) => o.text))

        // Group entries by their current canonical label (or null for unmerged), then sort:
        //   1. Groups whose canonical label exactly matches a listed option — floated to top
        //      for scrutiny (same exact, case-sensitive rule as the tally overlay).
        //   2. Groups with a canonical label that does NOT match a listed option.
        //   3. Unmerged entries (no canonical label yet).
        // Within each group, entries are ordered by raw-response count descending.
        type Group = { canonical: string | null; matchesListed: boolean; entries: Entry[] }
        const groupMap = new Map<string | null, Entry[]>()
        for (const entry of q.entries) {
          const canonical = merges[q.questionId]?.[entry.rawText] ?? entry.canonicalLabel
          const key = canonical ?? null
          if (!groupMap.has(key)) groupMap.set(key, [])
          groupMap.get(key)!.push(entry)
        }
        const groups: Group[] = [...groupMap.entries()].map(([canonical, entries]) => ({
          canonical,
          matchesListed: canonical !== null && listedOptionTexts.has(canonical),
          entries: entries.sort((a, b) => b.count - a.count),
        }))
        groups.sort((a, b) => {
          if (a.matchesListed !== b.matchesListed) return a.matchesListed ? -1 : 1
          if ((a.canonical === null) !== (b.canonical === null)) return a.canonical === null ? 1 : -1
          // Same tier: sort by total votes in group descending for consistency
          const aTotal = a.entries.reduce((s, e) => s + e.count, 0)
          const bTotal = b.entries.reduce((s, e) => s + e.count, 0)
          return bTotal - aTotal
        })

        return (
          <div
            key={q.questionId}
            className="bg-vh-surface rounded-[16px] p-6"
            style={{ border: "1px solid var(--vh-line)" }}
          >
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h3 className="text-[16px] font-semibold min-w-0 flex-1 break-words">{q.questionText}</h3>
              <span className="text-[12px] tabular-nums flex-shrink-0" style={{ color: "var(--vh-muted)" }}>
                {q.totalResponses} response{q.totalResponses !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-[13px] mb-4" style={{ color: "var(--vh-muted)" }}>
              Assign a canonical name to merge spelling variants before the tally is sealed. Unmapped responses count under their own raw text.
            </p>

            {q.entries.length === 0 ? (
              <p className="text-[14px]" style={{ color: "var(--vh-muted)" }}>No write-in responses for this question.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {groups.map((group) => (
                  <div key={group.canonical ?? "__unmerged__"}>
                    {/* Listed-option warning banner for the group */}
                    {group.matchesListed && group.canonical && (
                      <div
                        className="flex items-center gap-2 px-3 py-2 mb-1.5 rounded-[8px] text-[12px]"
                        style={{
                          background: "oklch(0.98 0.03 60)",
                          border: "1px solid oklch(0.85 0.08 60)",
                          color: "oklch(0.45 0.12 60)",
                        }}
                      >
                        <span>⚠</span>
                        <span>
                          These write-ins will be counted toward the pre-listed candidate{" "}
                          <strong>&ldquo;{group.canonical}&rdquo;</strong> — verify that this matches voter intent.
                        </span>
                      </div>
                    )}

                    {/* Column headers — only above first group, or each group */}
                    <div className="grid items-end gap-3 px-3 pb-1" style={{ gridTemplateColumns: "1fr auto 1fr auto" }}>
                      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--vh-muted)" }}>Raw response</span>
                      <span />
                      <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--vh-muted)" }}>Merge to (canonical name)</span>
                      <span />
                    </div>

                    <div className="flex flex-col gap-2">
                      {group.entries.map((entry) => {
                        const key = draftKey(q.questionId, entry.rawText)
                        const isSaving = !!saving[key]
                        const currentMerge = merges[q.questionId]?.[entry.rawText] ?? null
                        const draft = getDraft(q.questionId, entry.rawText)
                        const draftChanged = draft !== (currentMerge ?? "")
                        // Flag if the draft (in-progress label) would merge into a listed option
                        const draftMatchesListed = draft.trim() !== "" && listedOptionTexts.has(draft.trim())

                        // Similarity hint — exclude only the entry's exact raw text string.
                        // Normalizing would wrongly exclude "Chris Dewald" when the raw text
                        // is "Chris DeWald" — that near-duplicate is precisely what we want to show.
                        const pool = (questionPools[q.questionId] ?? []).filter(
                          (v) => v !== entry.rawText
                        )
                        const hintQuery = draft.trim() || entry.rawText
                        const topHint = bestMatches(hintQuery, pool, { threshold: SIMILARITY_THRESHOLD, limit: 1 })[0]
                        // Suppress hint when: the active query already equals the suggestion
                        // (nothing to nudge), or when the exact-match listed-candidate warning
                        // already covers it (avoid double-warning).
                        const showHint = topHint != null
                          && hintQuery !== topHint.value
                          && !(topHint.exact && draftMatchesListed)

                        return (
                          <div
                            key={entry.rawText}
                            className="grid items-start gap-3 px-3 py-2.5 rounded-[10px]"
                            style={{
                              gridTemplateColumns: "1fr auto 1fr auto",
                              background: currentMerge
                                ? group.matchesListed
                                  ? "oklch(0.97 0.04 60)"
                                  : "var(--vh-accent-soft)"
                                : "var(--vh-surface-2)",
                              border: `1px solid ${
                                currentMerge
                                  ? group.matchesListed
                                    ? "oklch(0.80 0.08 60)"
                                    : "oklch(0.85 0.05 255)"
                                  : "transparent"
                              }`,
                            }}
                          >
                            {/* Raw text + count */}
                            <div className="flex items-center gap-2 min-w-0 pt-[3px]">
                              <span className="text-[13.5px] break-words min-w-0" style={{ color: "var(--vh-ink-soft)" }}>
                                {entry.rawText}
                              </span>
                              {entry.count > 1 && (
                                <span
                                  className="flex-shrink-0 text-[12px] font-medium tabular-nums px-2 py-0.5 rounded-full"
                                  style={{ background: "var(--vh-surface-3, var(--vh-line))", color: "var(--vh-muted)" }}
                                >
                                  ×{entry.count}
                                </span>
                              )}
                            </div>

                            {/* Quick-fill button — clicking copies the raw write-in into the merge box */}
                            <button
                              type="button"
                              onClick={() => quickFill(q.questionId, entry.rawText)}
                              disabled={isSaving}
                              className="flex-shrink-0 text-[12px] font-medium px-2 py-0.5 rounded-[4px] transition-colors disabled:opacity-30 mt-[3px]"
                              style={{
                                background: "var(--vh-surface-3, var(--vh-line))",
                                color: "var(--vh-ink-soft)",
                                border: "1px solid var(--vh-line-strong)",
                              }}
                              title={`Use "${entry.rawText}" as the canonical name`}
                            >
                              →
                            </button>

                            {/* Canonical label input + live flags */}
                            <div className="flex flex-col gap-1 min-w-0">
                              <MergeCombobox
                                value={draft}
                                onValueChange={(v) => setDraft(q.questionId, entry.rawText, v)}
                                suggestions={pool}
                                placeholder={entry.rawText}
                                disabled={isSaving}
                                maxLength={500}
                                aria-label={`Canonical name for "${entry.rawText}"`}
                                onEnterKey={() => saveMerge(q.questionId, entry.rawText)}
                                style={{
                                  border: `1px solid ${
                                    draftMatchesListed && draftChanged
                                      ? "oklch(0.75 0.12 60)"
                                      : draftChanged
                                      ? "var(--vh-accent)"
                                      : "var(--vh-line-strong)"
                                  }`,
                                  background: "var(--vh-surface)",
                                  color: "var(--vh-ink)",
                                }}
                              />
                              {/* Live flag when typing a label that matches a listed option */}
                              {draftMatchesListed && draftChanged && (
                                <span className="text-[11px]" style={{ color: "oklch(0.50 0.12 60)" }}>
                                  ⚠ will merge into listed candidate
                                </span>
                              )}
                              {/* Similarity hint — shown proactively and after quick-fill/typing */}
                              {showHint && (
                                <div
                                  className="flex items-center justify-between gap-2 px-2 py-1 rounded-[6px] text-[11px]"
                                  style={{
                                    background: "var(--vh-accent-soft)",
                                    border: "1px solid oklch(0.85 0.05 255)",
                                    color: "var(--vh-ink-soft)",
                                  }}
                                >
                                  <span className="min-w-0 truncate">
                                    {topHint.exact
                                      ? `Matches "${topHint.value}" — merge to keep them together?`
                                      : `Similar to existing "${topHint.value}"`}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => applySuggestion(q.questionId, entry.rawText, topHint.value)}
                                    disabled={isSaving}
                                    className="flex-shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-[4px] transition-colors disabled:opacity-50"
                                    style={{ background: "var(--vh-accent)", color: "white" }}
                                    title={`Merge into "${topHint.value}"`}
                                  >
                                    Merge
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex items-center gap-1.5 flex-shrink-0 mt-[3px]">
                              {draftChanged && (
                                <button
                                  type="button"
                                  onClick={() => saveMerge(q.questionId, entry.rawText)}
                                  disabled={isSaving}
                                  className="text-[12px] font-medium px-2.5 py-1 rounded-[6px] transition-colors disabled:opacity-50"
                                  style={{ background: "var(--vh-accent)", color: "white" }}
                                >
                                  {isSaving ? "…" : "Save"}
                                </button>
                              )}
                              {currentMerge && !draftChanged && (
                                <button
                                  type="button"
                                  onClick={() => removeMerge(q.questionId, entry.rawText)}
                                  disabled={isSaving}
                                  className="text-[12px] px-2 py-1 rounded-[6px] transition-colors disabled:opacity-50"
                                  style={{ color: "var(--vh-muted)", background: "transparent" }}
                                  title="Remove merge"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Finalize section */}
      <div
        className="p-5 rounded-[16px]"
        style={{ background: "var(--vh-surface-2)", border: "1px solid var(--vh-line-strong)" }}
      >
        <h3 className="text-[15px] font-semibold mb-1">Ready to finalize?</h3>
        <p className="text-[13.5px] mb-4" style={{ color: "var(--vh-muted)" }}>
          Finalizing seals the tally hash and publishes results.{" "}
          {autoSendResults
            ? "Results will be emailed to all voters automatically."
            : "Results will not be auto-emailed — you can send them manually from the results page."}
          {" "}This action cannot be undone.
        </p>

        {!confirmFinalize ? (
          <button
            type="button"
            onClick={() => setConfirmFinalize(true)}
            disabled={finalizing || isPending}
            className="px-5 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: "var(--vh-accent)" }}
          >
            Finalize results →
          </button>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <p className="text-[13.5px] font-medium" style={{ color: "var(--vh-danger)" }}>
              Seal the tally and complete this election?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing || isPending}
                className="px-4 py-2 rounded-[8px] text-[13.5px] font-semibold text-white transition-colors disabled:opacity-50"
                style={{ background: "var(--vh-danger)" }}
              >
                {finalizing || isPending ? "Finalizing…" : "Yes, finalize"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                disabled={finalizing || isPending}
                className="px-4 py-2 rounded-[8px] text-[13.5px] font-medium transition-colors disabled:opacity-50"
                style={{ background: "var(--vh-surface)", border: "1px solid var(--vh-line-strong)", color: "var(--vh-ink-soft)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
