"use client"

import { useState, useRef, useMemo } from "react"
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

interface Props {
  token: string
  electionTitle: string
  electionDescription?: string | null
  questions: Question[]
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

  const questionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Per-voter stable option order — same token+question → same shuffle on every render.
  const shuffledOptionsMap = useMemo(() => {
    const map: Record<string, Option[]> = {}
    for (const q of questions) {
      if (q.randomizeOptions && (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE")) {
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
    if (q.type === "RANKED_CHOICE") return (rankedOrders[q.id] ?? []).length > 0
    if (q.type === "WRITE_IN") return !!((answers[q.id] as string) ?? "").trim()
    return true
  }

  function buildPayload():
    | { ok: true; payload: unknown[] }
    | { ok: false; error: string; questionIndex: number } {
    const payload: unknown[] = []
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (q.type === "SINGLE_CHOICE") {
        const optionId = answers[q.id] as string | undefined
        if (!optionId && q.required)
          return { ok: false, error: `Please answer: "${q.text}"`, questionIndex: i }
        if (optionId) payload.push({ questionId: q.id, type: "SINGLE_CHOICE", optionId })
      } else if (q.type === "MULTIPLE_CHOICE") {
        const optionIds = (answers[q.id] as string[]) ?? []
        if (optionIds.length === 0 && q.required)
          return { ok: false, error: `Please answer: "${q.text}"`, questionIndex: i }
        if (optionIds.length > 0) payload.push({ questionId: q.id, type: "MULTIPLE_CHOICE", optionIds })
      } else if (q.type === "RANKED_CHOICE") {
        const rankedIds = rankedOrders[q.id] ?? []
        if (rankedIds.length === 0 && q.required)
          return { ok: false, error: `Please rank at least one option for: "${q.text}"`, questionIndex: i }
        if (rankedIds.length > 0)
          payload.push({ questionId: q.id, type: "RANKED_CHOICE", rankedOptionIds: rankedIds })
      } else if (q.type === "WRITE_IN") {
        const text = (answers[q.id] as string) ?? ""
        if (!text.trim() && q.required)
          return { ok: false, error: `Please answer: "${q.text}"`, questionIndex: i }
        if (text.trim()) payload.push({ questionId: q.id, type: "WRITE_IN", text: text.trim() })
      }
    }
    return { ok: true, payload }
  }

  function goToReview() {
    const result = buildPayload()
    if (!result.ok) {
      setError(result.error)
      setStep(result.questionIndex)
      questionRefs.current[questions[result.questionIndex].id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
      return
    }
    setError("")
    setStep(questions.length)
  }

  async function handleConfirmSubmit() {
    const result = buildPayload()
    if (!result.ok) { setError(result.error); return }
    setSubmitting(true)
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answers: result.payload }),
    })
    setSubmitting(false)
    if (res.ok) {
      router.push(`/vote/${token}/confirmed`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Submission failed. Please try again.")
    }
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
    if (q.type === "SINGLE_CHOICE") {
      return (
        <div className="space-y-2.5">
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
        <div className="space-y-2.5">
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
      const rankedOptions = rankedIds.map((id) => q.options.find((o) => o.id === id)).filter(Boolean) as Option[]
      const unrankedOptions = q.options.filter((o) => !rankedIds.includes(o.id))

      return (
        <div className="space-y-3">
          {rankedOptions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-vh-muted uppercase tracking-wider mb-2">Ranked</p>
              <div className="space-y-2">
                {rankedOptions.map((o, i) => (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-[12px] border"
                    style={{ background: "var(--vh-accent-soft)", borderColor: "oklch(0.85 0.05 255)" }}
                  >
                    <span
                      className="w-9 h-9 flex-shrink-0 inline-grid place-items-center rounded-full text-white text-sm font-semibold"
                      style={{ background: "var(--vh-accent)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 min-w-0 break-words text-sm font-medium text-vh-ink">{o.text}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveRanked(q.id, i, -1)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 disabled:opacity-30 transition-colors"
                      >↑</button>
                      <button
                        type="button"
                        disabled={i === rankedOptions.length - 1}
                        onClick={() => moveRanked(q.id, i, 1)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 disabled:opacity-30 transition-colors"
                      >↓</button>
                      <button
                        type="button"
                        onClick={() => removeFromRanked(q.id, o.id)}
                        className="w-9 h-9 sm:w-7 sm:h-7 inline-grid place-items-center rounded-[6px] text-sm text-vh-muted hover:bg-vh-surface-3 transition-colors"
                      >×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unrankedOptions.length > 0 && (
            <div>
              {rankedOptions.length > 0 && (
                <p className="text-[11px] font-semibold text-vh-muted uppercase tracking-wider mb-2">Not ranked</p>
              )}
              <div className="space-y-2">
                {unrankedOptions.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => addToRanked(q.id, o.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed rounded-[12px] text-left transition-colors"
                    style={{ borderColor: "var(--vh-line-strong)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--vh-accent)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--vh-line-strong)")}
                  >
                    <span
                      className="w-9 h-9 flex-shrink-0 inline-grid place-items-center rounded-full border border-dashed text-xl text-vh-muted"
                      style={{ borderColor: "var(--vh-line-strong)" }}
                    >+</span>
                    <span className="flex-1 min-w-0 break-words text-sm text-vh-ink-soft text-left">{o.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {rankedIds.length === 0 && (
            <p className="text-xs text-vh-muted">Tap options above to rank them in order of preference.</p>
          )}
        </div>
      )
    }

    if (q.type === "WRITE_IN") {
      const text = (answers[q.id] as string) ?? ""
      return (
        <div className="relative">
          <Textarea
            placeholder="Your response…"
            value={text}
            onChange={(e) => {
              const v = e.target.value
              if (v.length <= 500) setAnswers((a) => ({ ...a, [q.id]: v }))
            }}
            rows={4}
            className="resize-none pr-14"
          />
          <span className="absolute bottom-2.5 right-3 text-[11px] text-vh-muted pointer-events-none tabular-nums">
            {text.length}/500
          </span>
        </div>
      )
    }

    return null
  }

  // ── Review step ─────────────────────────────────────────────────────────

  if (step === questions.length) {
    return (
      <div className="min-h-screen bg-vh-bg">
        <header className="sticky top-0 z-10 bg-vh-surface border-b border-vh-line">
          <div className="max-w-xl mx-auto px-4 py-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setStep(questions.length - 1); setError("") }}
              className="text-vh-muted hover:text-vh-ink transition-colors p-1 leading-none"
            >
              ←
            </button>
            <BrandMark size={20} />
            <p className="flex-1 text-sm font-semibold text-vh-ink">Review your ballot</p>
          </div>
        </header>

        <div className="max-w-xl mx-auto px-4 py-8 space-y-3">
          <p className="text-[13px] text-vh-muted pb-1">
            Check your answers below. Use Edit to change any response before submitting.
          </p>

          {questions.map((q, i) => (
            <div key={q.id} className="bg-vh-surface border border-vh-line rounded-card p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <span
                    className="inline-flex items-center text-[11px] font-semibold rounded-pill px-2 py-0.5 mb-1.5"
                    style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }}
                  >
                    Q{i + 1}
                  </span>
                  <p className="text-[14px] font-medium text-vh-ink break-words">{q.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setStep(i); setError("") }}
                  className="shrink-0 text-xs text-vh-ink-soft border border-vh-line px-2.5 py-1 rounded-[8px] hover:bg-vh-surface-2 transition-colors"
                >
                  Edit
                </button>
              </div>
              <div className="space-y-0.5">
                {getSummaryLines(q).map((line, j) => (
                  <p key={j} className="text-[13px] text-vh-muted">{line}</p>
                ))}
              </div>
            </div>
          ))}

          <p className="text-[12px] text-vh-muted text-center py-1">
            🔒 Once submitted, your ballot is final and recorded anonymously.
          </p>

          {error && <p className="text-sm text-center" style={{ color: "var(--vh-danger)" }}>{error}</p>}

          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={submitting}
            className="w-full py-3.5 font-semibold text-white text-[15px] rounded-[var(--vh-radius-sm)] transition-opacity disabled:opacity-60"
            style={{ background: "var(--vh-accent)" }}
          >
            {submitting ? "Submitting…" : "Submit my ballot"}
          </button>
        </div>
      </div>
    )
  }

  // ── Ballot view ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-vh-bg">

      {/* ── Mobile sticky header ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-20 bg-vh-surface border-b border-vh-line">
        <div className="flex items-center justify-between px-4 h-12">
          <BrandMark size={20} />
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
          <BrandMark size={22} className="mb-8" />
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
        <main className="flex-1 py-12 px-10 overflow-y-auto">
          <div className="max-w-[720px]">
            <h1 className="text-2xl font-semibold text-vh-ink mb-1">{electionTitle}</h1>
            {electionDescription && (
              <p className="text-[15px] leading-relaxed text-vh-muted mb-10 whitespace-pre-wrap">{electionDescription}</p>
            )}

            <div className="space-y-10">
              {questions.map((q, i) => (
                <section
                  key={q.id}
                  ref={(el) => { questionRefs.current[q.id] = el }}
                >
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="inline-flex items-center text-[11px] font-semibold rounded-pill px-2 py-0.5"
                        style={{ background: "var(--vh-accent-soft)", color: "var(--vh-accent-strong)" }}
                      >
                        Q{i + 1}
                      </span>
                      {q.required && (
                        <span className="text-xs" style={{ color: "var(--vh-danger)" }}>Required</span>
                      )}
                    </div>
                    <h3 className="text-[18px] font-semibold text-vh-ink">{q.text}</h3>
                    {q.description && (
                      <p className="text-[15px] leading-relaxed text-vh-muted mt-1.5">{q.description}</p>
                    )}
                    {q.type === "MULTIPLE_CHOICE" && q.maxSelections && (
                      <p className="text-xs text-vh-muted mt-1.5">
                        Pick up to {q.maxSelections}{" "}
                        <span className="tabular-nums">
                          ({((answers[q.id] as string[]) ?? []).length}/{q.maxSelections})
                        </span>
                      </p>
                    )}
                  </div>
                  {renderQuestionInput(q)}
                </section>
              ))}
            </div>

            {error && (
              <p className="mt-6 text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
            )}

            <div
              className="mt-12 -mx-10 px-10 py-6 border-t border-vh-line flex items-center justify-between"
              style={{ background: "var(--vh-ink)" }}
            >
              <p className="text-sm text-white/70">Review your answers before submitting.</p>
              <button
                type="button"
                onClick={goToReview}
                className="px-5 py-2.5 text-[15px] font-semibold rounded-[var(--vh-radius-sm)] transition-colors"
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
          <h2 className="text-[22px] font-semibold text-vh-ink leading-snug">
            {questions[step].text}
            {questions[step].required && (
              <span className="ml-1 text-base" style={{ color: "var(--vh-danger)" }}>*</span>
            )}
          </h2>
          {questions[step].description && (
            <p className="text-[15px] leading-relaxed text-vh-muted mt-2">{questions[step].description}</p>
          )}
          {questions[step].type === "MULTIPLE_CHOICE" && questions[step].maxSelections && (
            <p className="text-xs text-vh-muted mt-2">
              Pick up to {questions[step].maxSelections}{" "}
              <span className="tabular-nums">
                ({((answers[questions[step].id] as string[]) ?? []).length}/{questions[step].maxSelections})
              </span>
            </p>
          )}
        </div>

        {renderQuestionInput(questions[step])}

        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--vh-danger)" }}>{error}</p>
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
          <p className="text-[11px] text-vh-muted text-center mt-1.5">
            Answer required to continue
          </p>
        )}
      </div>
    </div>
  )
}
