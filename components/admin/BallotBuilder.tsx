"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useUnsavedChangesGuard } from "@/components/admin/UnsavedChangesGuard"
import { Textarea } from "@/components/ui/textarea"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"
import ImageUploadField from "@/components/admin/ImageUploadField"

type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"

interface OptionDraft {
  id?: string
  text: string
  order: number
  bio?: string
  photoUrl?: string
  photoDeleteUrl?: string
  website?: string
}

interface QuestionDraft {
  id?: string
  text: string
  description?: string
  type: QuestionType
  order: number
  required: boolean
  maxSelections?: number
  randomizeOptions?: boolean
  showOptionAvatars?: boolean
  options: OptionDraft[]
}

interface Props {
  electionId: string
  electionStatus: "DRAFT" | "ACTIVE" | "COMPLETED"
  firstVoteAt: string | null
  initialQuestions: QuestionDraft[]
}

const TYPES: { value: QuestionType; label: string }[] = [
  { value: "SINGLE_CHOICE", label: "Single choice" },
  { value: "MULTIPLE_CHOICE", label: "Multiple" },
  { value: "RANKED_CHOICE", label: "Preference Ranking" },
  { value: "WRITE_IN", label: "Write-in" },
]

const inputCls = "w-full text-sm rounded-[10px] px-3 py-2.5 transition-colors"
const inputStyle = {
  border: "1px solid var(--vh-line-strong)",
  background: "var(--vh-surface)",
  color: "var(--vh-ink)",
  outline: "none",
}
function onFocusIn(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--vh-accent)"
  e.target.style.boxShadow = "var(--vh-ring)"
}
function onFocusOut(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "var(--vh-line-strong)"
  e.target.style.boxShadow = "none"
}
function blockEnter(e: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === "Enter") e.preventDefault()
}
function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}

export default function BallotBuilder({ electionId, electionStatus, firstVoteAt, initialQuestions }: Props) {
  const router = useRouter()
  const [questions, setQuestions] = useState<QuestionDraft[]>(initialQuestions)
  const [saving, setSaving] = useState(false)
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set())
  const locked = electionStatus !== "DRAFT" || !!firstVoteAt

  const baseline = useRef(JSON.stringify(initialQuestions))
  const isDirty = () => JSON.stringify(questions) !== baseline.current

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      {
        text: "",
        type: "SINGLE_CHOICE",
        order: qs.length,
        required: true,
        randomizeOptions: false,
        showOptionAvatars: true,
        options: [
          { text: "", order: 0 },
          { text: "", order: 1 },
        ],
      },
    ])
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i })))
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)))
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= questions.length) return
    const updated = [...questions]
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    setQuestions(updated.map((q, i) => ({ ...q, order: i })))
  }

  function addOption(qIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: [...q.options, { text: "", order: q.options.length }] }
          : q
      )
    )
  }

  function updateOption(qIndex: number, oIndex: number, patch: Partial<OptionDraft>) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.map((o, j) => (j === oIndex ? { ...o, ...patch } : o)) }
          : q
      )
    )
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.filter((_, j) => j !== oIndex).map((o, j) => ({ ...o, order: j })) }
          : q
      )
    )
  }

  function toggleDetails(key: string) {
    setExpandedDetails((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save(): Promise<boolean> {
    setSaving(true)
    const res = await fetch(`/api/elections/${electionId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questions),
    })
    setSaving(false)
    if (res.ok) {
      baseline.current = JSON.stringify(questions)
      return true
    }
    const body = await res.json().catch(() => ({}))
    const issues: Array<{ path: (string | number)[]; message: string }> = Array.isArray(body?.error) ? body.error : []
    const QUESTION_LABELS: Record<string, string> = {
      text: "Question text", description: "Description", maxSelections: "Max selections",
    }
    const OPTION_LABELS: Record<string, string> = {
      text: "Option text", bio: "Description", photoUrl: "Photo URL", website: "Website",
    }
    const msgs = issues.map((issue) => {
      const [q, f, o, of_] = issue.path
      if (typeof q === "number" && f === "options" && typeof o === "number" && of_ != null) {
        return `Q${q + 1} Option ${(o as number) + 1} — ${OPTION_LABELS[String(of_)] ?? String(of_)}: ${issue.message}`
      }
      if (typeof q === "number" && f != null) {
        return `Q${q + 1} — ${QUESTION_LABELS[String(f)] ?? String(f)}: ${issue.message}`
      }
      return issue.message
    })
    toast.error(msgs[0] || "Failed to save ballot", {
      description: msgs.length > 1 ? msgs.slice(1).join("\n") : undefined,
    })
    return false
  }

  useUnsavedChangesGuard({ isDirty, save })

  async function handleSave(andContinue = false) {
    const ok = await save()
    if (ok) {
      if (andContinue) {
        router.push(`/elections/${electionId}/voters`)
      } else {
        toast.success("Ballot saved")
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Toaster />

      {/* Status banners */}
      {electionStatus === "ACTIVE" && !firstVoteAt && (
        <div
          className="flex items-center gap-3 rounded-[14px] px-[18px] py-3.5"
          style={{
            background: "var(--vh-warn-soft)",
            border: "1px solid oklch(0.85 0.08 80)",
          }}
        >
          <div
            className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
            style={{ background: "oklch(0.65 0.12 75)" }}
          >
            !
          </div>
          <div className="text-[13.5px]" style={{ color: "oklch(0.4 0.12 65)" }}>
            <strong>Election is live.</strong> Ballot is read-only. Set status to Draft to make changes.
          </div>
        </div>
      )}
      {electionStatus === "COMPLETED" && (
        <div
          className="rounded-[14px] px-[18px] py-3.5 text-[13.5px]"
          style={{
            background: "var(--vh-surface-2)",
            border: "1px solid var(--vh-line-strong)",
            color: "var(--vh-ink-soft)",
          }}
        >
          This election is completed. The ballot is read-only.
        </div>
      )}

      {/* Question cards */}
      {questions.map((q, qIndex) => (
        <div
          key={qIndex}
          className="bg-vh-surface rounded-[16px] p-5"
          style={{ border: "1px solid var(--vh-line)" }}
        >
          <div className="flex gap-3.5 items-start">
            {/* Number badge */}
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white font-semibold text-[14px] flex-shrink-0"
              style={{ background: "var(--vh-accent)" }}
            >
              {qIndex + 1}
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              {/* Question text */}
              <textarea
                ref={autoResize}
                placeholder="Question text"
                value={q.text}
                onChange={(e) => { autoResize(e.currentTarget); updateQuestion(qIndex, { text: e.target.value }) }}
                onKeyDown={blockEnter}
                disabled={locked}
                rows={1}
                className={`${inputCls} resize-none overflow-hidden`}
                style={{ ...inputStyle, fontSize: 15, fontWeight: 500 }}
                onFocus={onFocusIn}
                onBlur={onFocusOut}
              />

              {/* Description */}
              <Textarea
                placeholder="Voter explanation (optional)"
                value={q.description ?? ""}
                onChange={(e) => updateQuestion(qIndex, { description: e.target.value || undefined })}
                rows={2}
                className="text-sm resize-none rounded-[10px]"
                disabled={locked}
                style={{
                  border: "1px solid var(--vh-line-strong)",
                  background: "var(--vh-surface)",
                  color: "var(--vh-ink)",
                  fontSize: 13,
                }}
              />

              {/* Type + required toggles */}
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1.5 flex-wrap items-center">
                  {TYPES.map((t) => {
                    const active = q.type === t.value
                    return (
                      <button
                        key={t.value}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          if (locked) return
                          updateQuestion(qIndex, {
                            type: t.value,
                            maxSelections: t.value === "MULTIPLE_CHOICE" ? q.maxSelections : undefined,
                            options: t.value === "WRITE_IN" ? [] : q.options.length ? q.options : [{ text: "", order: 0 }, { text: "", order: 1 }],
                          })
                        }}
                        className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
                        style={{
                          border: `1px solid ${active ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                          background: active ? "var(--vh-accent-soft)" : "var(--vh-surface)",
                          color: active ? "var(--vh-accent-strong)" : "var(--vh-ink-soft)",
                          fontWeight: active ? 500 : 400,
                          cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && updateQuestion(qIndex, { required: !q.required })}
                    className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
                    style={{
                      border: `1px solid ${q.required ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                      background: q.required ? "var(--vh-accent)" : "var(--vh-surface)",
                      color: q.required ? "white" : "var(--vh-ink-soft)",
                      cursor: locked ? "not-allowed" : "pointer",
                    }}
                  >
                    {q.required ? "Required" : "Optional"}
                  </button>
                  {(q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE") && (
                    <>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => !locked && updateQuestion(qIndex, { randomizeOptions: !q.randomizeOptions })}
                        className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
                        style={{
                          border: `1px solid ${q.randomizeOptions ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                          background: q.randomizeOptions ? "var(--vh-accent)" : "var(--vh-surface)",
                          color: q.randomizeOptions ? "white" : "var(--vh-ink-soft)",
                          cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        Randomize order
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => !locked && updateQuestion(qIndex, { showOptionAvatars: !(q.showOptionAvatars ?? true) })}
                        className="px-2.5 py-1.5 rounded-[8px] text-[12.5px] transition-colors"
                        style={{
                          border: `1px solid ${(q.showOptionAvatars ?? true) ? "var(--vh-accent)" : "var(--vh-line-strong)"}`,
                          background: (q.showOptionAvatars ?? true) ? "var(--vh-accent)" : "var(--vh-surface)",
                          color: (q.showOptionAvatars ?? true) ? "white" : "var(--vh-ink-soft)",
                          cursor: locked ? "not-allowed" : "pointer",
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        Show avatars
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Options */}
              {q.type !== "WRITE_IN" && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {q.options.map((o, oIndex) => {
                    const detailKey = `${qIndex}-${oIndex}`
                    const detailOpen = expandedDetails.has(detailKey)
                    return (
                      <div key={oIndex}>
                        <div
                          className="flex gap-2 items-center rounded-[10px] px-2 py-1.5"
                          style={{ background: "var(--vh-surface-2)" }}
                        >
                          <textarea
                            ref={autoResize}
                            placeholder={`Option ${oIndex + 1}`}
                            value={o.text}
                            onChange={(e) => { autoResize(e.currentTarget); updateOption(qIndex, oIndex, { text: e.target.value }) }}
                            onKeyDown={blockEnter}
                            disabled={locked}
                            rows={1}
                            className="flex-1 min-w-0 text-sm px-2.5 py-1.5 rounded-[8px] transition-colors resize-none overflow-hidden leading-snug"
                            style={{
                              border: "1px solid var(--vh-line-strong)",
                              background: "var(--vh-surface)",
                              color: "var(--vh-ink)",
                              outline: "none",
                            }}
                            onFocus={onFocusIn}
                            onBlur={onFocusOut}
                          />
                          <button
                            type="button"
                            onClick={() => toggleDetails(detailKey)}
                            disabled={locked}
                            className="flex items-center gap-0.5 text-[13px] font-semibold px-2 py-1 rounded-[7px] transition-colors"
                            style={{ color: "var(--vh-muted)", background: "transparent" }}
                          >
                            Details
                            {detailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOption(qIndex, oIndex)}
                            disabled={locked || q.options.length <= 2}
                            className="text-[16px] px-1.5 transition-colors"
                            style={{
                              color: "var(--vh-muted)",
                              opacity: q.options.length <= 2 ? 0.35 : 1,
                              cursor: q.options.length <= 2 ? "not-allowed" : "pointer",
                            }}
                          >
                            ×
                          </button>
                        </div>

                        {detailOpen && (
                          <div
                            className="mt-1.5 ml-2 sm:ml-10 rounded-[10px] p-3 flex flex-col gap-2"
                            style={{ background: "var(--vh-bg)", border: "1px solid var(--vh-line)" }}
                          >
                            <div>
                              <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--vh-muted)" }}>Description</label>
                              <Textarea
                                placeholder="Short description shown to voters (max 500 chars)"
                                value={o.bio ?? ""}
                                onChange={(e) => updateOption(qIndex, oIndex, { bio: e.target.value || undefined })}
                                rows={2}
                                maxLength={500}
                                className="text-sm resize-none rounded-[8px]"
                                disabled={locked}
                              />
                            </div>
                            <div>
                              <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--vh-muted)" }}>Photo</label>
                              <ImageUploadField
                                preset="avatar"
                                url={o.photoUrl ?? ""}
                                setUrl={(v) => updateOption(qIndex, oIndex, { photoUrl: v || undefined })}
                                deleteUrl={o.photoDeleteUrl ?? ""}
                                setDeleteUrl={(v) => updateOption(qIndex, oIndex, { photoDeleteUrl: v || undefined })}
                                disabled={locked}
                              />
                            </div>
                            <div>
                              <label className="block text-[13px] font-medium mb-1" style={{ color: "var(--vh-muted)" }}>Website</label>
                              <input
                                type="url"
                                placeholder="example.com"
                                value={o.website ?? ""}
                                onChange={(e) => updateOption(qIndex, oIndex, { website: e.target.value || undefined })}
                                disabled={locked}
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                autoComplete="url"
                                inputMode="url"
                                className="w-full text-sm px-2.5 py-1.5 rounded-[8px]"
                                style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink)", outline: "none" }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={() => addOption(qIndex)}
                    disabled={locked}
                    className="self-start text-[13px] px-2.5 py-1 transition-colors"
                    style={{ color: "var(--vh-accent)", background: "transparent", opacity: locked ? 0.4 : 1 }}
                  >
                    + Add option
                  </button>

                  {q.type === "MULTIPLE_CHOICE" && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <label className="text-[12.5px] whitespace-nowrap" style={{ color: "var(--vh-muted)" }}>Max selections</label>
                      <input
                        type="number"
                        min={1}
                        max={q.options.length}
                        inputMode="numeric"
                        placeholder="No limit"
                        value={q.maxSelections ?? ""}
                        onChange={(e) =>
                          updateQuestion(qIndex, {
                            maxSelections: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        disabled={locked}
                        className="w-28 text-sm px-2 py-1.5 rounded-[8px]"
                        style={{ border: "1px solid var(--vh-line-strong)", background: "var(--vh-surface)", color: "var(--vh-ink)", outline: "none" }}
                      />
                      <span className="text-[12px]" style={{ color: "var(--vh-muted)" }}>Leave blank for no limit</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Move / delete controls */}
            <div className="flex flex-col gap-0.5 pt-0.5">
              <button
                type="button"
                onClick={() => moveQuestion(qIndex, -1)}
                disabled={locked || qIndex === 0}
                className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-[7px] text-lg font-bold transition-colors disabled:opacity-30"
                style={{ color: "var(--vh-muted)", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveQuestion(qIndex, 1)}
                disabled={locked || qIndex === questions.length - 1}
                className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-[7px] text-lg font-bold transition-colors disabled:opacity-30"
                style={{ color: "var(--vh-muted)", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeQuestion(qIndex)}
                disabled={locked}
                className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-[7px] text-lg font-bold transition-colors disabled:opacity-30"
                style={{ color: "var(--vh-danger)", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-danger-soft)" }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add question + Save */}
      {!locked && (
        <>
          <button
            type="button"
            onClick={addQuestion}
            className="w-full py-5 rounded-[16px] text-[14px] transition-colors"
            style={{
              border: "2px dashed var(--vh-line-strong)",
              background: "transparent",
              color: "var(--vh-muted)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--vh-accent)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-accent)" }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--vh-line-strong)"; (e.currentTarget as HTMLElement).style.color = "var(--vh-muted)" }}
          >
            + Add question
          </button>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving || questions.length === 0}
              className="w-full sm:w-auto px-5 py-2.5 rounded-[10px] text-[14px] font-medium transition-colors disabled:opacity-50"
              style={{ background: "var(--vh-surface)", color: "var(--vh-ink-soft)", border: "1px solid var(--vh-line-strong)" }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-surface-2)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-surface)" }}
            >
              {saving ? "Saving…" : "Save ballot"}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving || questions.length === 0}
              className="w-full sm:w-auto px-5 py-2.5 rounded-[10px] text-[14px] font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--vh-accent)" }}
              onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLElement).style.background = "var(--vh-accent-strong)" }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--vh-accent)" }}
            >
              {saving ? "Saving…" : "Save & continue to voters →"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
