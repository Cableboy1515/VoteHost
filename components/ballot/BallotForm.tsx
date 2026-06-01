"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import { useRouter } from "next/navigation"
import { BrandMark } from "@/components/ui/brand-mark"
import { OptionCard } from "@/components/ui/option-card"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// FNV-1a 32-bit hash → mulberry32 PRNG → Fisher-Yates stable shuffle.
// Used for per-voter deterministic option ordering to eliminate primacy bias.
function fnv1a32(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr]
  let a = fnv1a32(seed)
  for (let i = copy.length - 1; i > 0; i--) {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = (t + Math.imul(t ^ t >>> 7, 61 | t) ^ t) >>> 0
    const j = t % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

interface Option {
  id: string
  text: string
  bio?: string | null
  photoUrl?: string | null
  website?: string | null
}

interface Question {
  id: string
  text: string
  description?: string | null
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"
  required: boolean
  maxSelections?: number | null
  randomizeOptions?: boolean
  showOptionAvatars?: boolean
  options: Option[]
}

interface BallotIssue {
  questionId: string
  questionIndex: number
  questionText: string
  message: string
}

interface Props {
  token: string
  electionTitle: string
  electionDescription?: string | null
  questions: Question[]
}

function formatServerError(data: unknown): string {
  if (typeof data !== "object" || data === null) return "Submission failed. Please try again."
  const d = data as Record<string, unknown>
  if (typeof d.error === "string") return d.error
  if (d.error && typeof d.error === "object") return "Some answers are missing required fields. Please go back and fix them."
  return "Submission failed. Please try again."
}

/** Avatar for ranked choice items — photo if available, initials circle otherwise. */
function RcvAvatar({ option, size = 40 }: { option: Option; size?: number }) {
  if (option.photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={option.photoUrl}
        alt={option.text}
        className="flex-shrink-0 rounded-full object-cover border border-vh-line"
        style={{ width: size, height: size }}
      />
    )
  }
  const parts = option.text.trim().split(/\s+/)
  const letters = (parts.length >= 2
    ? parts[0][0] + parts[parts.length - 1][0]
    : option.text.slice(0, 2)
  ).toUpperCase()
  return (
    <span
      aria-hidden
      className="flex-shrink-0 inline-grid place-items-center rounded-full font-semibold"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: "var(--vh-surface-3)",
        color: "var(--vh-ink-soft)",
        border: "1px solid var(--vh-line)",
      }}
    >
      {letters}
    </span>
  )
}

export default function BallotForm({ token, electionTitle, electionDescription, questions }: Props) {
  const router = useRouter()

  // 0..questions.length-1 = ballot step; questions.length = review
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  // Ranked choice: ordered array of selected option IDs (starts empty — users tap to add)
  const [rankedOrders, setRankedOrders] = useState<Record<string, string[]>>(
    Object.fromEntries(questions.filter((q) => q.type === "RANKED_CHOICE").map((q) => [q.id, []]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [issuesPanelOpen, setIssuesPanelOpen] = useState(false)

  const questionRefs = useRef<Record<string, HTMLElement | null>>({})
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the current question heading when the mobile step changes
  // so keyboard/screen-reader users land in the right place.
  useEffect(() => {
    stepHeadingRef.current?.focus()
  }, [step])

  // Per-voter stable option order — same token+question → same shuffle on every render.
  const shuffledOptionsMap = useMemo(() => {
    const map: Record<string, Option[]> = {}
    for (const q of questions) {
      if (q.randomizeOptions && (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE" || q.type === "RANKED_CHOICE")) {
        map[q.id] = seededShuffle(q.options, `${token}:${q.id}`)
      } else {
        map[q.id] = q.options
      }
    }
    return map
  }, [token, questions])

  // ── Ranked choice handlers ──────────────────────────────────────────────

  function addToRanked(questionId: string, optionId: string) {
    setRankedOrders((prev) => ({ ...prev, [questionId]: [...prev[questionId], optionId] }))
  }

  function removeFromRanked(questionId: string, optionId: string) {
    setRankedOrders((prev) => ({ ...prev, [questionId]: prev[questionId].filter((id) => id !== optionId) }))
  }

  function moveRanked(questionId: string, index: number, dir: -1 | 1) {
    setRankedOrders((prev) => {
      const next = [...prev[questionId]]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, [questionId]: next }
    })
  }

  // ── Validation ──────────────────────────────────────────────────────────

  function isAnswered(q: Question): boolean {
    if (q.type === "SINGLE_CHOICE") return !!(answers[q.id])
    if (q.type === "MULTIPLE_CHOICE") return ((answers[q.id] as string[]) ?? []).length > 0
    if (q.type === "RANKED_CHOICE") return (rankedOrders[q.id] ?? []).length >= 1
    if (q.type === "WRITE_IN") return !!((answers[q.id] as string) ?? "").trim()
    return true
  }

  function buildPayload():
    | { ok: true; payload: unknown[] }
    | { ok: false; issues: BallotIssue[] } {
    const payload: unknown[] = []
    const issues: BallotIssue[] = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (q.type === "SINGLE_CHOICE") {
        const optionId = answers[q.id] as string | undefined
        if (!optionId && q.required) {
          issues.push({ questionId: q.id, questionIndex: i, questionText: q.text, message: "Please choose an option." })
        } else if (optionId) {
          payload.push({ questionId: q.id, type: "SINGLE_CHOICE", optionId })
        }
      } else if (q.type === "MULTIPLE_CHOICE") {
        const optionIds = (answers[q.id] as string[]) ?? []
        if (optionIds.length === 0 && q.required) {
          issues.push({ questionId: q.id, questionIndex: i, questionText: q.text, message: "Please choose at least one option." })
        } else if (optionIds.length > 0) {
          payload.push({ questionId: q.id, type: "MULTIPLE_CHOICE", optionIds })
        }
      } else if (q.type === "RANKED_CHOICE") {
        const rankedIds = rankedOrders[q.id] ?? []
        if (rankedIds.length === 0 && q.required) {
          issues.push({ questionId: q.id, questionIndex: i, questionText: q.text, message: "Please rank at least one option." })
        } else if (rankedIds.length >= 1) {
          payload.push({ questionId: q.id, type: "RANKED_CHOICE", rankedOptionIds: rankedIds })
        }
        // rankedIds.length === 0 && !q.required → skip (valid partial ballot)
      } else if (q.type === "WRITE_IN") {
        const text = (answers[q.id] as string) ?? ""
        if (!text.trim() && q.required) {
          issues.push({ questionId: q.id, questionIndex: i, questionText: q.text, message: "Please write a response." })
        } else if (text.trim()) {
          payload.push({ questionId: q.id, type: "WRITE_IN", text: text.trim() })
        }
      }
    }
    if (issues.length > 0) return { ok: false, issues }
    return { ok: true, payload }
  }

  function goToReview() {
    const result = buildPayload()
    if (!result.ok) {
      setIssuesPanelOpen(true)
      setError("")
      const first = result.issues[0]
      setStep(first.questionIndex)
      scrollToQuestion(first.questionId)
      return
    }
    setIssuesPanelOpen(false)
    setError("")
    setStep(questions.length)
  }

  async function handleConfirmSubmit() {
    const result = buildPayload()
    if (!result.ok) {
      setIssuesPanelOpen(true)
      setError("")
      const first = result.issues[0]
      setStep(first.questionIndex)
      scrollToQuestion(first.questionId)
      return
    }
    setSubmitting(true)
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answers: result.payload }),
    })
    setSubmitting(false)
    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      const receipt = (data as { receiptCode?: string }).receiptCode
      router.push(`/vote/${token}/confirmed${receipt ? `?receipt=${encodeURIComponent(receipt)}` : ""}`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(formatServerError(data))
    }
  }

  // Derived — recomputed every render; only non-empty when issuesPanelOpen and items remain
  const activeIssues: BallotIssue[] = (() => {
    if (!issuesPanelOpen) return []
    const r = buildPayload()
    return r.ok ? [] : r.issues
  })()

  // Fast lookup: questionId → error message, for inline per-question errors
  const issueByQuestionId = new Map(activeIssues.map((i) => [i.questionId, i.message]))

  // Smooth-scroll to a question, wrapped in rAF so the target is mounted
  // after any step/view transition before the scroll fires.
  function scrollToQuestion(id: string) {
    requestAnimationFrame(() =>
      questionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" })
    )
  }

  // ── Issues panel ────────────────────────────────────────────────────────

  function renderIssuesPanel(layout: "desktop" | "mobile") {
    if (!issuesPanelOpen || activeIssues.length === 0) return null
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={cn("rounded-[12px] border p-4 space-y-2.5", layout === "desktop" ? "mb-8" : "mb-4 mt-4")}
        style={{ background: "oklch(0.98 0.012 15)", borderColor: "var(--vh-danger)" }}
      >
        <p className="text-sm font-semibold" style={{ color: "var(--vh-danger)" }}>
          Almost there — a few items need attention before you can submit:
        </p>
        <ul className="space-y-2">
          {activeIssues.map((issue) => (
            <li key={issue.questionId} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-vh-ink">Q{issue.questionIndex + 1}: {issue.questionText}</p>
                <p className="text-xs text-vh-ink-soft">{issue.message}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep(issue.questionIndex)
                  scrollToQuestion(issue.questionId)
                }}
                className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-[6px] border transition-colors"
                style={{ borderColor: "var(--vh-danger)", color: "var(--vh-danger)" }}
              >
                Fix →
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  // ── Summary lines (review) ──────────────────────────────────────────────

  function getSummaryLines(q: Question): string[] {
    if (q.type === "SINGLE_CHOICE") {
      const option = q.options.find((o) => o.id === answers[q.id])
      return option ? [option.text] : ["(no selection)"]
    }
    if (q.type === "MULTIPLE_CHOICE") {
      const optionIds = (answers[q.id] as string[]) ?? []
      const selected = q.options.filter((o) => optionIds.includes(o.id))
      return selected.length > 0 ? selected.map((o) => o.text) : ["(no selection)"]
    }
    if (q.type === "RANKED_CHOICE") {
      const rankedIds = rankedOrders[q.id] ?? []
      if (rankedIds.length === 0) return ["(not ranked)"]
      return rankedIds.map((id, i) => `${i + 1}. ${q.options.find((o) => o.id === id)?.text ?? id}`)
    }
    const text = (answers[q.id] as string) ?? ""
    return text.trim() ? [text.trim()] : ["(no response)"]
  }

  // ── Question input renderer ─────────────────────────────────────────────

  function renderQuestionInput(q: Question) {
    const groupLabelId = `q-label-${q.id}`

    if (q.type === "SINGLE_CHOICE") {
      return (
        <div role="group" aria-labelledby={groupLabelId} className="space-y-2.5">
          {shuffledOptionsMap[q.id].map((o) => (
            <OptionCard
              key={o.id}
              name={o.text}
              bio={o.bio}
              photoUrl={o.photoUrl}
              website={o.website}
              showAvatar={q.showOptionAvatars !== false}
              type="single"
              checked={answers[q.id] === o.id}
              onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
            />
          ))}
        </div>
      )
    }

    if (q.type === "MULTIPLE_CHOICE") {
      const selected = (answers[q.id] as string[]) ?? []
      const atLimit = !!q.maxSelections && selected.length >= q.maxSelections
      return (
        <div role="group" aria-labelledby={groupLabelId} className="space-y-2.5">
          {shuffledOptionsMap[q.id].map((o) => {
            const isChecked = selected.includes(o.id)
            return (
              <OptionCard
                key={o.id}
                name={o.text}
                bio={o.bio}
                photoUrl={o.photoUrl}
                website={o.website}
                showAvatar={q.showOptionAvatars !== false}
                type="multi"
                checked={isChecked}
                disabled={!isChecked && atLimit}
                onChange={() => {
                  if (!isChecked && atLimit) return
                  setAnswers((a) => ({
                    ...a,
                    [q.id]: isChecked
                      ? selected.filter((id) => id !== o.id)
                      : [...selected, o.id],
                  }))
                }}
              />
            )
          })}
        </div>
      )
    }

    if (q.type === "RANKED_CHOICE") {
      const rankedIds = rankedOrders[q.id] ?? []
      // Use the shuffled map so randomizeOptions works for ranked choice too
      const allOptions = shuffledOptionsMap[q.id]
      const rankedOptions = rankedIds.map((id) => allOptions.find((o) => o.id === id)).filter(Boolean) as Option[]
      const unrankedOptions = allOptions.filter((o) => !rankedIds.includes(o.id))
      const showAvatars = q.showOptionAvatars !== false

      return (
        <div aria-labelledby={groupLabelId} className="space-y-3">
          {rankedOptions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-vh-muted uppercase tracking-wider mb-2" aria-hidden>Your Ranking</p>
              <ol aria-label="Your current ranking" className="space-y-2">
                {rankedOptions.map((o, i) => (
                  <li
                    key={o.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[12px] border"
                    style={{ background: "var(--vh-accent-soft)", borderColor: "oklch(0.85 0.05 255)" }}
                  >
                    {/* Avatar on the left */}
                    {showAvatars && <RcvAvatar option={o} size={40} />}

                    {/* Name */}
                    <span className="flex-1 min-w-0 break-words text-sm font-medium text-vh-ink">{o.text}</span>

                    {/* Reorder / remove controls */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        aria-label={`Move ${o.text} up`}
                        onClick={() => moveRanked(q.id, i, -1)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 disabled:opacity-30 transition-colors"
                      >↑</button>
                      <button
                        type="button"
                        disabled={i === rankedOptions.length - 1}
                        aria-label={`Move ${o.text} down`}
                        onClick={() => moveRanked(q.id, i, 1)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 disabled:opacity-30 transition-colors"
                      >↓</button>
                      <button
                        type="button"
                        aria-label={`Remove ${o.text} from your ranking`}
                        onClick={() => removeFromRanked(q.id, o.id)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 transition-colors"
                      >×</button>
                    </div>

                    {/* Rank badge on the right */}
                    <span
                      aria-hidden
                      className="w-8 h-8 flex-shrink-0 inline-grid place-items-center rounded-full text-white text-sm font-semibold"
                      style={{ background: "var(--vh-accent)" }}
                    >
                      {i + 1}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {unrankedOptions.length > 0 && (
            <div>
              {rankedOptions.length > 0 && (
                <p className="text-[11px] font-semibold text-vh-muted uppercase tracking-wider mb-2" aria-hidden>Not ranked</p>
              )}
              <ul aria-label="Unranked options — select to add to your ranking" className="space-y-2 list-none">
                {unrankedOptions.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      aria-label={`Add ${o.text} to your ranking`}
                      onClick={() => addToRanked(q.id, o.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 border-2 border-dashed rounded-[12px] text-left transition-colors"
                      style={{ borderColor: "var(--vh-line-strong)" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--vh-accent)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--vh-line-strong)")}
                    >
                      {/* Avatar or + placeholder */}
                      {showAvatars
                        ? <RcvAvatar option={o} size={40} />
                        : (
                          <span
                            aria-hidden
                            className="w-9 h-9 flex-shrink-0 inline-grid place-items-center rounded-full border border-dashed text-xl text-vh-muted"
                            style={{ borderColor: "var(--vh-line-strong)" }}
                          >+</span>
                        )
                      }
                      <span className="flex-1 min-w-0 break-words text-sm text-vh-ink-soft text-left">{o.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rankedIds.length === 0 && (
            <p className="text-xs text-vh-muted" aria-live="polite">Tap an option to add it to your ranking. Rank as many or as few as you like.</p>
          )}
        </div>
      )
    }

    if (q.type === "WRITE_IN") {
      const text = (answers[q.id] as string) ?? ""
      const counterId = `writein-counter-${q.id}`
      return (
        <div className="relative">
          <Textarea
            placeholder="Your response…"
            value={text}
            aria-describedby={counterId}
            onChange={(e) => {
              const v = e.target.value
              if (v.length <= 500) setAnswers((a) => ({ ...a, [q.id]: v }))
            }}
            rows={4}
            className="resize-none pr-14"
          />
          <span
            id={counterId}
            aria-live="polite"
            className="absolute bottom-2.5 right-3 text-[11px] text-vh-muted pointer-events-none tabular-nums"
          >
            {text.length}/500
          </span>
        </div>
      )
    }

    return null
  }

  // ── Review step ─────────────────────────────────────────────────────────

  if (step === questions.length) {
    const reviewCards = (
      <>
        {questions.map((q, i) => (
          <div key={q.id} className="bg-vh-surface border border-vh-line rounded-card p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0 flex-1">
                <span
                  className="inline-flex items-center justify-center text-base font-semibold rounded-[8px] px-2.5 mb-1.5"
                  style={{ background: "var(--vh-accent)", color: "var(--vh-accent-fg)", minWidth: 32, height: 32 }}
                >
                  {i + 1}
                </span>
                <p className="text-base font-medium text-vh-ink break-words">{q.text}</p>
              </div>
              <button
                type="button"
                onClick={() => { setStep(i); setError("") }}
                className="shrink-0 text-sm text-vh-ink-soft border border-vh-line px-3 py-1.5 rounded-[8px] hover:bg-vh-surface-2 transition-colors"
              >
                Edit
              </button>
            </div>
            {q.type === "RANKED_CHOICE" ? (
              <div className="space-y-2">
                {(rankedOrders[q.id] ?? []).length === 0 ? (
                  <p className="text-base text-vh-muted">(not ranked)</p>
                ) : (
                  (rankedOrders[q.id] ?? []).map((id, idx) => {
                    const opt = q.options.find((o) => o.id === id)
                    return (
                      <div
                        key={id}
                        className="flex items-center gap-3 px-3 py-2 rounded-[12px] border"
                        style={{ background: "var(--vh-accent-soft)", borderColor: "oklch(0.85 0.05 255)" }}
                      >
                        <span
                          className="w-8 h-8 flex-shrink-0 inline-grid place-items-center rounded-full text-white text-sm font-semibold"
                          style={{ background: "var(--vh-accent)" }}
                        >
                          {idx + 1}
                        </span>
                        <span className="flex-1 min-w-0 break-words text-base font-medium text-vh-ink">
                          {opt?.text ?? id}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {getSummaryLines(q).map((line, j) => (
                  <p key={j} className="text-base font-medium text-vh-ink break-words">{line}</p>
                ))}
              </div>
            )}
          </div>
        ))}

        <p className="text-sm text-vh-muted text-center py-1">
          🔒 Once submitted, your ballot is final and recorded anonymously.
        </p>

        {error && <p className="text-base text-center" style={{ color: "var(--vh-danger)" }}>{error}</p>}

        <button
          type="button"
          onClick={handleConfirmSubmit}
          disabled={submitting}
          className="w-full py-3.5 font-semibold text-white text-base rounded-[var(--vh-radius-sm)] transition-opacity disabled:opacity-60"
          style={{ background: "var(--vh-accent)" }}
        >
          {submitting ? "Submitting…" : "Submit my ballot"}
        </button>
      </>
    )

    return (
      <div className="min-h-screen bg-vh-bg">

        {/* ── Mobile ── */}
        <div className="md:hidden">
          <header className="sticky top-0 z-10 bg-vh-surface border-b border-vh-line">
            <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setStep(questions.length - 1); setError("") }}
                className="text-vh-muted hover:text-vh-ink transition-colors p-1 leading-none"
              >
                ←
              </button>
              <BrandMark size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-vh-ink">Review your ballot</p>
                <p className="text-xs text-vh-muted truncate">{electionTitle}</p>
              </div>
            </div>
          </header>
          <div className="max-w-xl mx-auto px-4 py-8 space-y-4">
            <p className="text-sm text-vh-muted pb-1">
              Check your answers below. Use Edit to change any response before submitting.
            </p>
            {reviewCards}
          </div>
        </div>

        {/* ── Desktop 2-column layout ── */}
        <div className="hidden md:flex min-h-screen">
          <aside
            className="w-[260px] flex-shrink-0 sticky top-0 h-screen border-r border-vh-line bg-vh-surface overflow-y-auto flex flex-col"
            style={{ padding: "28px 20px" }}
          >
            <BrandMark size={28} className="mb-8" />
            <p className="text-[15px] font-semibold text-vh-ink mb-4 break-words">{electionTitle}</p>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => { setStep(questions.length - 1); setError("") }}
              className="w-full py-2.5 text-sm font-semibold text-vh-ink-soft bg-vh-surface border border-vh-line rounded-[var(--vh-radius-sm)] hover:bg-vh-surface-2 transition-colors"
            >
              ← Back to questions
            </button>
          </aside>
          <main className="flex-1 py-12 px-10 overflow-y-auto">
            <div className="max-w-[564px]">
              <div className="mb-10">
                <h1 className="text-2xl font-semibold text-vh-ink mb-1">Review your ballot</h1>
                <p className="text-[15px] leading-relaxed text-vh-muted">
                  Check your answers below. Use Edit to change any response before submitting.
                </p>
              </div>
              <div className="space-y-4">
                {reviewCards}
              </div>
            </div>
          </main>
        </div>

      </div>
    )
  }

  // ── Ballot view ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-vh-bg">
      <a
        href="#ballot-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:rounded-[8px] focus:text-sm focus:font-medium focus:text-white"
        style={{ background: "var(--vh-accent)" }}
      >
        Skip to ballot
      </a>

      {/* ── Mobile sticky header ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20 bg-vh-surface border-b border-vh-line">
        <div className="flex items-center justify-between px-4 h-12">
          <BrandMark size={28} />
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-pill px-2.5 py-1"
            style={{ background: "var(--vh-surface-3)", color: "var(--vh-muted)" }}
          >
            🔒 Encrypted
          </span>
          <span className="text-xs tabular-nums text-vh-muted font-medium">
            {step + 1}/{questions.length}
          </span>
        </div>
        {/* Segmented progress bar */}
        <div className="flex gap-0.5 px-4 pb-2.5">
          {questions.map((_, i) => (
            <div
              key={i}
              className="h-[2px] flex-1 rounded-pill transition-colors duration-300"
              style={{ background: i <= step ? "var(--vh-accent)" : "var(--vh-surface-3)" }}
            />
          ))}
        </div>
      </header>

      {/* ── Desktop 2-column layout ── */}
      <div className="hidden md:flex min-h-screen">
        {/* Left rail */}
        <aside
          className="w-[260px] flex-shrink-0 sticky top-0 h-screen border-r border-vh-line bg-vh-surface overflow-y-auto flex flex-col"
          style={{ padding: "28px 20px" }}
        >
          <BrandMark size={28} className="mb-8" />
          <p className="text-[15px] font-semibold text-vh-ink mb-4 break-words">
            {electionTitle}
          </p>
          <nav className="space-y-1 flex-1">
            {questions.map((q, i) => {
              const done = isAnswered(q)
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => questionRefs.current[q.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-[var(--vh-radius-sm)] text-sm transition-colors hover:bg-vh-surface-2"
                >
                  <span
                    className="w-5 h-5 flex-shrink-0 inline-grid place-items-center rounded-full text-[11px] font-semibold mt-0.5"
                    style={{
                      background: done ? "var(--vh-accent)" : "var(--vh-surface-3)",
                      color: done ? "white" : "var(--vh-muted)",
                    }}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="break-words text-vh-ink-soft">{q.text}</span>
                </button>
              )
            })}
          </nav>

          <div className="pt-6">
            <button
              type="button"
              onClick={goToReview}
              className="w-full py-2.5 text-sm font-semibold text-white rounded-[var(--vh-radius-sm)] transition-colors"
              style={{ background: "var(--vh-accent)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--vh-accent)")}
            >
              Review &amp; submit →
            </button>
          </div>
        </aside>

        {/* Right column — all questions */}
        <main id="ballot-main" className="flex-1 py-12 px-10 overflow-y-auto">
          <div className="max-w-[564px]">
            <div className="mb-16">
              <h1 className="text-2xl font-semibold text-vh-ink mb-1">{electionTitle}</h1>
              {electionDescription && (
                <p className="text-[15px] leading-relaxed text-vh-muted whitespace-pre-wrap">{electionDescription}</p>
              )}
            </div>

            {renderIssuesPanel("desktop")}

            <div className="space-y-10">
              {questions.map((q, i) => {
                const inlineError = issueByQuestionId.get(q.id)
                return (
                  <section
                    key={q.id}
                    ref={(el) => { questionRefs.current[q.id] = el }}
                    className={cn(inlineError && "-mx-4 px-4 py-4 rounded-[12px]")}
                    style={inlineError ? { border: "1px solid var(--vh-danger)", background: "oklch(0.98 0.012 15)" } : undefined}
                  >
                    <div className="mb-4 flex items-start gap-3">
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span
                          className="inline-flex items-center justify-center text-base font-semibold rounded-[8px] px-2.5"
                          style={{ background: "var(--vh-accent)", color: "var(--vh-accent-fg)", minWidth: 32, height: 32 }}
                        >
                          {i + 1}
                        </span>
                        {q.required && (
                          <span className="text-[11px] font-medium" style={{ color: "var(--vh-danger)" }}>Required</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <h3 id={`q-label-${q.id}`} className="text-[18px] font-semibold text-vh-ink">{q.text}</h3>
                        {q.description && (
                          <p className="text-[15px] leading-relaxed text-vh-muted mt-1.5">{q.description}</p>
                        )}
                        {q.type === "MULTIPLE_CHOICE" && q.maxSelections && (
                          <p className="text-sm text-vh-muted mt-1.5">
                            Pick up to {q.maxSelections}{" "}
                            <span className="tabular-nums">
                              ({((answers[q.id] as string[]) ?? []).length}/{q.maxSelections})
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="pl-11">{renderQuestionInput(q)}</div>
                    {inlineError && (
                      <p className="pl-11 mt-2 text-sm font-medium" style={{ color: "var(--vh-danger)" }}>
                        ⚠ {inlineError}
                      </p>
                    )}
                  </section>
                )
              })}
            </div>

            {error && (
              <p role="alert" className="mt-6 text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
            )}

            <div
              className="mt-12 ml-11 px-6 py-5 rounded-[14px] flex items-center justify-between gap-4"
              style={{ background: "var(--vh-accent)" }}
            >
              <p className="text-[16px] font-bold text-white min-w-0">Review your answers before submitting.</p>
              <button
                type="button"
                onClick={goToReview}
                className="px-5 py-2.5 text-[15px] font-semibold rounded-[var(--vh-radius-sm)] transition-colors flex-shrink-0"
                style={{ background: "white", color: "var(--vh-ink)" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "white")}
              >
                Review &amp; submit →
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ── Mobile: single question at a time ── */}
      <div className="md:hidden pt-[88px] pb-[104px] px-4">
        <div className="mb-5">
          <p className="text-xs font-medium text-vh-muted mb-1.5">
            Question {step + 1} of {questions.length}
          </p>
          <h2
            id={`q-label-${questions[step].id}`}
            ref={stepHeadingRef}
            tabIndex={-1}
            className="text-[22px] font-semibold text-vh-ink leading-snug outline-none"
          >
            {questions[step].text}
            {questions[step].required && (
              <span className="ml-1 text-base" style={{ color: "var(--vh-danger)" }}>*</span>
            )}
          </h2>
          {questions[step].description && (
            <p className="text-[15px] leading-relaxed text-vh-muted mt-2">{questions[step].description}</p>
          )}
          {questions[step].type === "MULTIPLE_CHOICE" && questions[step].maxSelections && (
            <p className="text-sm text-vh-muted mt-2">
              Pick up to {questions[step].maxSelections}{" "}
              <span className="tabular-nums">
                ({((answers[questions[step].id] as string[]) ?? []).length}/{questions[step].maxSelections})
              </span>
            </p>
          )}
        </div>

        {renderIssuesPanel("mobile")}

        {renderQuestionInput(questions[step])}

        {issueByQuestionId.get(questions[step].id) && (
          <p className="mt-2 text-sm font-medium" style={{ color: "var(--vh-danger)" }}>
            ⚠ {issueByQuestionId.get(questions[step].id)}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
        )}
      </div>

      {/* ── Mobile sticky footer ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-vh-surface border-t border-vh-line px-4 py-3">
        <div className="flex gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => { setStep((s) => s - 1); setError("") }}
              className="px-4 py-3 border border-vh-line-strong rounded-[var(--vh-radius-sm)] text-sm font-medium text-vh-ink transition-colors hover:bg-vh-surface-2 flex-none"
            >
              ← Back
            </button>
          ) : (
            <div className="flex-none w-[72px]" />
          )}

          <button
            type="button"
            className={cn(
              "flex-1 py-3 rounded-[var(--vh-radius-sm)] font-semibold text-white text-sm transition-opacity",
              questions[step].required && !isAnswered(questions[step]) && "opacity-50"
            )}
            style={{ background: "var(--vh-accent)" }}
            onClick={() => {
              const q = questions[step]
              if (q.required && !isAnswered(q)) {
                setError("Answer this question to continue")
                return
              }
              setError("")
              if (step === questions.length - 1) {
                goToReview()
              } else {
                setStep((s) => s + 1)
              }
            }}
          >
            {step === questions.length - 1 ? "Review →" : "Next question →"}
          </button>
        </div>

        {questions[step].required && !isAnswered(questions[step]) && (
          <p role="status" aria-live="polite" className="text-[11px] text-vh-muted text-center mt-1.5">
            Answer required to continue
          </p>
        )}
      </div>
    </div>
  )
}
