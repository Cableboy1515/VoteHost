"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface Option {
  id: string
  text: string
  bio?: string
  photoUrl?: string
  website?: string
}

interface Question {
  id: string
  text: string
  description?: string
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"
  required: boolean
  maxSelections?: number
  options: Option[]
}

interface Props {
  token: string
  electionTitle: string
  electionDescription?: string
  questions: Question[]
}

interface AnswerSummary {
  questionText: string
  type: Question["type"]
  lines: string[]
}

function hasInfo(o: Option) {
  return !!(o.bio || o.photoUrl || o.website)
}

function OptionInfoPanel({ option }: { option: Option }) {
  return (
    <div className="mt-2 ml-6 p-3 bg-zinc-50 border border-zinc-200 rounded-md space-y-2 text-sm">
      {option.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.photoUrl} alt="" className="max-w-[140px] rounded object-cover" />
      )}
      {option.bio && <p className="text-zinc-700 leading-relaxed">{option.bio}</p>}
      {option.website && (
        <a
          href={option.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {option.website}
        </a>
      )}
    </div>
  )
}

function SortableOption({
  option,
  rank,
  expanded,
  onToggle,
}: {
  option: Option
  rank: number
  expanded: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  return (
    <div>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
        className="flex items-center gap-3 p-3 bg-white border rounded"
        {...attributes}
      >
        <span className="text-zinc-400 font-mono text-sm w-6 text-right">{rank}.</span>
        <span className="text-sm flex-1">{option.text}</span>
        {hasInfo(option) && (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-blue-600 hover:underline shrink-0"
          >
            {expanded ? "Hide info" : "Read more"}
          </button>
        )}
        <span
          className="text-zinc-300 cursor-grab active:cursor-grabbing"
          {...listeners}
        >
          ⣿
        </span>
      </div>
      {expanded && hasInfo(option) && <OptionInfoPanel option={option} />}
    </div>
  )
}

export default function BallotForm({ token, electionTitle, electionDescription, questions }: Props) {
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor))

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [rankedOrders, setRankedOrders] = useState<Record<string, Option[]>>(
    Object.fromEntries(questions.filter((q) => q.type === "RANKED_CHOICE").map((q) => [q.id, [...q.options]]))
  )
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingPayload, setPendingPayload] = useState<unknown[]>([])

  function toggleExpanded(optionId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(optionId)) next.delete(optionId)
      else next.add(optionId)
      return next
    })
  }

  function handleSingleChoice(questionId: string, optionId: string) {
    setAnswers((a) => ({ ...a, [questionId]: optionId }))
  }

  function handleMultipleChoice(questionId: string, optionId: string, checked: boolean) {
    setAnswers((a) => {
      const current = (a[questionId] as string[]) ?? []
      const question = questions.find((q) => q.id === questionId)
      if (checked && question?.maxSelections && current.length >= question.maxSelections) return a
      return {
        ...a,
        [questionId]: checked ? [...current, optionId] : current.filter((id) => id !== optionId),
      }
    })
  }

  function handleWriteIn(questionId: string, text: string) {
    setAnswers((a) => ({ ...a, [questionId]: text }))
  }

  function handleDragEnd(questionId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setRankedOrders((prev) => {
      const opts = prev[questionId]
      const oldIndex = opts.findIndex((o) => o.id === active.id)
      const newIndex = opts.findIndex((o) => o.id === over.id)
      return { ...prev, [questionId]: arrayMove(opts, oldIndex, newIndex) }
    })
  }

  function buildSummary(): AnswerSummary[] {
    return questions.map((q) => {
      if (q.type === "SINGLE_CHOICE") {
        const optionId = answers[q.id] as string | undefined
        const option = q.options.find((o) => o.id === optionId)
        return { questionText: q.text, type: q.type, lines: option ? [option.text] : ["(no selection)"] }
      }
      if (q.type === "MULTIPLE_CHOICE") {
        const optionIds = (answers[q.id] as string[]) ?? []
        const selected = q.options.filter((o) => optionIds.includes(o.id))
        return { questionText: q.text, type: q.type, lines: selected.length > 0 ? selected.map((o) => o.text) : ["(no selection)"] }
      }
      if (q.type === "RANKED_CHOICE") {
        const ranked = rankedOrders[q.id] ?? q.options
        return { questionText: q.text, type: q.type, lines: ranked.map((o, i) => `${i + 1}. ${o.text}`) }
      }
      // WRITE_IN
      const text = (answers[q.id] as string) ?? ""
      return { questionText: q.text, type: q.type, lines: text.trim() ? [text.trim()] : ["(no response)"] }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    const payload: unknown[] = []
    for (const q of questions) {
      if (q.type === "SINGLE_CHOICE") {
        const optionId = answers[q.id] as string | undefined
        if (!optionId && q.required) { setError(`Please answer: ${q.text}`); return }
        if (optionId) payload.push({ questionId: q.id, type: "SINGLE_CHOICE", optionId })
      } else if (q.type === "MULTIPLE_CHOICE") {
        const optionIds = (answers[q.id] as string[]) ?? []
        if (optionIds.length === 0 && q.required) { setError(`Please answer: ${q.text}`); return }
        if (optionIds.length > 0) payload.push({ questionId: q.id, type: "MULTIPLE_CHOICE", optionIds })
      } else if (q.type === "RANKED_CHOICE") {
        const ranked = rankedOrders[q.id] ?? q.options
        payload.push({ questionId: q.id, type: "RANKED_CHOICE", rankedOptionIds: ranked.map((o) => o.id) })
      } else if (q.type === "WRITE_IN") {
        const text = (answers[q.id] as string) ?? ""
        if (!text.trim() && q.required) { setError(`Please answer: ${q.text}`); return }
        if (text.trim()) payload.push({ questionId: q.id, type: "WRITE_IN", text: text.trim() })
      }
    }

    setPendingPayload(payload)
    setShowConfirm(true)
  }

  async function handleConfirmSubmit() {
    setSubmitting(true)
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answers: pendingPayload }),
    })
    setSubmitting(false)

    if (res.ok) {
      router.push(`/vote/${token}/confirmed`)
    } else {
      setShowConfirm(false)
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Submission failed. Please try again.")
    }
  }

  const summary = showConfirm ? buildSummary() : []

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">{electionTitle}</h1>
        {electionDescription && (
          <p className="text-zinc-600 text-sm mb-3 whitespace-pre-wrap">{electionDescription}</p>
        )}
        <p className="text-zinc-400 text-sm mb-8">Complete all required questions and submit your vote.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {q.text}
                  {q.required && <span className="text-red-400 ml-1">*</span>}
                </CardTitle>
                {q.description && (
                  <p className="text-sm text-zinc-500 mt-1">{q.description}</p>
                )}
              </CardHeader>
              <CardContent>
                {q.type === "SINGLE_CHOICE" && (
                  <div className="space-y-2">
                    {q.options.map((o) => (
                      <div key={o.id}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="radio"
                            name={q.id}
                            value={o.id}
                            checked={answers[q.id] === o.id}
                            onChange={() => handleSingleChoice(q.id, o.id)}
                          />
                          <span className="text-sm flex-1">{o.text}</span>
                          {hasInfo(o) && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(o.id)}
                              className="text-xs text-blue-600 hover:underline shrink-0"
                            >
                              {expanded.has(o.id) ? "Hide info" : "Read more"}
                            </button>
                          )}
                        </label>
                        {expanded.has(o.id) && hasInfo(o) && <OptionInfoPanel option={o} />}
                      </div>
                    ))}
                  </div>
                )}

                {q.type === "MULTIPLE_CHOICE" && (
                  <div className="space-y-2">
                    {q.maxSelections && (
                      <p className="text-xs text-zinc-400">
                        Select up to {q.maxSelections} option{q.maxSelections !== 1 ? "s" : ""}.
                        {" "}({((answers[q.id] as string[]) ?? []).length} / {q.maxSelections} selected)
                      </p>
                    )}
                    {q.options.map((o) => {
                      const selected = (answers[q.id] as string[]) ?? []
                      const isChecked = selected.includes(o.id)
                      const atLimit = !!q.maxSelections && selected.length >= q.maxSelections
                      return (
                        <div key={o.id}>
                          <label
                            className={cn(
                              "flex items-center gap-3",
                              atLimit && !isChecked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                            )}
                          >
                            <input
                              type="checkbox"
                              value={o.id}
                              checked={isChecked}
                              disabled={atLimit && !isChecked}
                              onChange={(e) => handleMultipleChoice(q.id, o.id, e.target.checked)}
                            />
                            <span className="text-sm flex-1">{o.text}</span>
                            {hasInfo(o) && (
                              <button
                                type="button"
                                onClick={() => toggleExpanded(o.id)}
                                className="text-xs text-blue-600 hover:underline shrink-0"
                              >
                                {expanded.has(o.id) ? "Hide info" : "Read more"}
                              </button>
                            )}
                          </label>
                          {expanded.has(o.id) && hasInfo(o) && <OptionInfoPanel option={o} />}
                        </div>
                      )
                    })}
                  </div>
                )}

                {q.type === "RANKED_CHOICE" && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-400 mb-3">Drag to rank from most preferred (1st) to least.</p>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(q.id, e)}>
                      <SortableContext items={(rankedOrders[q.id] ?? q.options).map((o) => o.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {(rankedOrders[q.id] ?? q.options).map((o, i) => (
                            <SortableOption
                              key={o.id}
                              option={o}
                              rank={i + 1}
                              expanded={expanded.has(o.id)}
                              onToggle={() => toggleExpanded(o.id)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                )}

                {q.type === "WRITE_IN" && (
                  <Textarea
                    placeholder="Your response…"
                    value={(answers[q.id] as string) ?? ""}
                    onChange={(e) => handleWriteIn(q.id, e.target.value)}
                    rows={3}
                  />
                )}
              </CardContent>
            </Card>
          ))}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full">
            Review &amp; Submit
          </Button>
        </form>
      </div>

      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Review your ballot</DialogTitle>
            <DialogDescription>
              Please confirm your selections. Your vote cannot be changed after submission.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
            {summary.map((item, i) => (
              <div key={i} className="space-y-1">
                <p className="text-sm font-medium text-zinc-700">{item.questionText}</p>
                <div className="pl-3 border-l-2 border-zinc-200 space-y-0.5">
                  {item.lines.map((line, j) => (
                    <p key={j} className="text-sm text-zinc-600">{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirm(false)} disabled={submitting}>
              Go back
            </Button>
            <Button onClick={handleConfirmSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Confirm & submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
