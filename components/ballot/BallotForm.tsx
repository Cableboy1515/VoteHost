"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
}

interface Question {
  id: string
  text: string
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"
  required: boolean
  options: Option[]
}

interface Props {
  token: string
  electionTitle: string
  questions: Question[]
}

function SortableOption({ option, rank }: { option: Option; rank: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 p-3 bg-white border rounded cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <span className="text-zinc-400 font-mono text-sm w-6 text-right">{rank}.</span>
      <span className="text-sm">{option.text}</span>
      <span className="ml-auto text-zinc-300">⣿</span>
    </div>
  )
}

export default function BallotForm({ token, electionTitle, questions }: Props) {
  const router = useRouter()
  const sensors = useSensors(useSensor(PointerSensor))

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [rankedOrders, setRankedOrders] = useState<Record<string, Option[]>>(
    Object.fromEntries(questions.filter((q) => q.type === "RANKED_CHOICE").map((q) => [q.id, [...q.options]]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  function handleSingleChoice(questionId: string, optionId: string) {
    setAnswers((a) => ({ ...a, [questionId]: optionId }))
  }

  function handleMultipleChoice(questionId: string, optionId: string, checked: boolean) {
    setAnswers((a) => {
      const current = (a[questionId] as string[]) ?? []
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

  async function handleSubmit(e: React.FormEvent) {
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

    setSubmitting(true)
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, answers: payload }),
    })
    setSubmitting(false)

    if (res.ok) {
      router.push(`/vote/${token}/confirmed`)
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Submission failed. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-1">{electionTitle}</h1>
        <p className="text-zinc-500 text-sm mb-8">Complete all required questions and submit your vote.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {q.text}
                  {q.required && <span className="text-red-400 ml-1">*</span>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {q.type === "SINGLE_CHOICE" && (
                  <div className="space-y-2">
                    {q.options.map((o) => (
                      <label key={o.id} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name={q.id}
                          value={o.id}
                          checked={answers[q.id] === o.id}
                          onChange={() => handleSingleChoice(q.id, o.id)}
                        />
                        <span className="text-sm">{o.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === "MULTIPLE_CHOICE" && (
                  <div className="space-y-2">
                    {q.options.map((o) => (
                      <label key={o.id} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          value={o.id}
                          checked={((answers[q.id] as string[]) ?? []).includes(o.id)}
                          onChange={(e) => handleMultipleChoice(q.id, o.id, e.target.checked)}
                        />
                        <span className="text-sm">{o.text}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === "RANKED_CHOICE" && (
                  <div className="space-y-2">
                    <p className="text-xs text-zinc-400 mb-3">Drag to rank from most preferred (1st) to least.</p>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(q.id, e)}>
                      <SortableContext items={(rankedOrders[q.id] ?? q.options).map((o) => o.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {(rankedOrders[q.id] ?? q.options).map((o, i) => (
                            <SortableOption key={o.id} option={o} rank={i + 1} />
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

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Vote"}
          </Button>
        </form>
      </div>
    </div>
  )
}
