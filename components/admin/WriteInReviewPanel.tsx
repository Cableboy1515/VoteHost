"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

interface Entry {
  rawText: string
  count: number
  canonicalLabel: string | null
}

interface QuestionData {
  questionId: string
  questionText: string
  totalResponses: number
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

  async function saveMerge(questionId: string, rawText: string) {
    const canonical = (getDraft(questionId, rawText) || rawText).trim()
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

      {questions.map((q) => (
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
            <div className="flex flex-col gap-2">
              {/* Column headers */}
              <div className="grid items-center gap-3 px-3 pb-1" style={{ gridTemplateColumns: "1fr auto 1fr auto" }}>
                <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--vh-muted)" }}>Raw response</span>
                <span />
                <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--vh-muted)" }}>Merge to (canonical name)</span>
                <span />
              </div>

              {q.entries.map((entry) => {
                const key = draftKey(q.questionId, entry.rawText)
                const isSaving = !!saving[key]
                const currentMerge = merges[q.questionId]?.[entry.rawText] ?? null
                const draft = getDraft(q.questionId, entry.rawText)
                const draftChanged = draft !== (currentMerge ?? "")

                return (
                  <div
                    key={entry.rawText}
                    className="grid items-center gap-3 px-3 py-2.5 rounded-[10px]"
                    style={{
                      gridTemplateColumns: "1fr auto 1fr auto",
                      background: currentMerge ? "var(--vh-accent-soft)" : "var(--vh-surface-2)",
                      border: `1px solid ${currentMerge ? "oklch(0.85 0.05 255)" : "transparent"}`,
                    }}
                  >
                    {/* Raw text + count */}
                    <div className="flex items-center gap-2 min-w-0">
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

                    {/* Arrow */}
                    <span className="text-[14px]" style={{ color: "var(--vh-muted)" }}>→</span>

                    {/* Canonical label input */}
                    <input
                      type="text"
                      placeholder={entry.rawText}
                      value={draft}
                      onChange={(e) => setDraft(q.questionId, entry.rawText, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveMerge(q.questionId, entry.rawText)
                      }}
                      disabled={isSaving}
                      maxLength={500}
                      className="w-full text-sm rounded-[8px] px-2.5 py-1.5"
                      style={{
                        border: `1px solid ${draftChanged ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                        background: "var(--vh-surface)",
                        color: "var(--vh-ink)",
                        outline: "none",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                      aria-label={`Canonical name for "${entry.rawText}"`}
                    />

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
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
          )}
        </div>
      ))}

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
