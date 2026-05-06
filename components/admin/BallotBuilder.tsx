"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "RANKED_CHOICE" | "WRITE_IN"

interface OptionDraft {
  id?: string
  text: string
  order: number
}

interface QuestionDraft {
  id?: string
  text: string
  type: QuestionType
  order: number
  required: boolean
  maxSelections?: number
  options: OptionDraft[]
}

interface Props {
  electionId: string
  electionStatus: "DRAFT" | "ACTIVE" | "CLOSED" | "COMPLETED"
  initialQuestions: QuestionDraft[]
}

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  RANKED_CHOICE: "Ranked choice",
  WRITE_IN: "Write-in",
}

export default function BallotBuilder({ electionId, electionStatus, initialQuestions }: Props) {
  const [questions, setQuestions] = useState<QuestionDraft[]>(initialQuestions)
  const [saving, setSaving] = useState(false)
  const locked = electionStatus !== "DRAFT"

  function addQuestion() {
    setQuestions((qs) => [
      ...qs,
      {
        text: "",
        type: "SINGLE_CHOICE",
        order: qs.length,
        required: true,
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

  function updateOption(qIndex: number, oIndex: number, text: string) {
    setQuestions((qs) =>
      qs.map((q, i) =>
        i === qIndex
          ? {
              ...q,
              options: q.options.map((o, j) => (j === oIndex ? { ...o, text } : o)),
            }
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

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/elections/${electionId}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questions),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Ballot saved")
    } else {
      toast.error("Failed to save ballot")
    }
  }

  return (
    <div className="space-y-4">
      <Toaster />
      {electionStatus === "ACTIVE" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>This election is live.</strong> The ballot cannot be edited while the election is active. Set the election to Draft to make changes.
        </div>
      )}
      {electionStatus === "CLOSED" && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
          This election is closed. The ballot is read-only.
        </div>
      )}
      {electionStatus === "COMPLETED" && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-600">
          This election has completed. The ballot is read-only.
        </div>
      )}
      {questions.map((q, qIndex) => (
        <Card key={qIndex}>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Question text"
                    value={q.text}
                    onChange={(e) => updateQuestion(qIndex, { text: e.target.value })}
                    className="flex-1"
                    disabled={locked}
                  />
                  <Select
                    value={q.type}
                    disabled={locked}
                    onValueChange={(v) => {
                      if (v === null) return
                      updateQuestion(qIndex, {
                        type: v as QuestionType,
                        maxSelections: v === "MULTIPLE_CHOICE" ? q.maxSelections : undefined,
                        options: v === "WRITE_IN" ? [] : q.options.length ? q.options : [{ text: "", order: 0 }, { text: "", order: 1 }],
                      })
                    }}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant={q.required ? "default" : "secondary"} className={locked ? "select-none opacity-50" : "cursor-pointer select-none"} onClick={() => !locked && updateQuestion(qIndex, { required: !q.required })}>
                    {q.required ? "Required" : "Optional"}
                  </Badge>
                </div>

                {q.type !== "WRITE_IN" && (
                  <div className="space-y-2 pl-2">
                    {q.options.map((o, oIndex) => (
                      <div key={oIndex} className="flex gap-2">
                        <Input
                          placeholder={`Option ${oIndex + 1}`}
                          value={o.text}
                          onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                          className="flex-1"
                          disabled={locked}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOption(qIndex, oIndex)}
                          disabled={locked || q.options.length <= 2}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIndex)} disabled={locked}>
                      + Add option
                    </Button>
                    {q.type === "MULTIPLE_CHOICE" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Label className="text-xs text-zinc-500 whitespace-nowrap">Max selections</Label>
                        <Input
                          type="number"
                          min={1}
                          max={q.options.length}
                          placeholder="No limit"
                          value={q.maxSelections ?? ""}
                          onChange={(e) =>
                            updateQuestion(qIndex, {
                              maxSelections: e.target.value === "" ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-24 h-7 text-sm"
                          disabled={locked}
                        />
                        <span className="text-xs text-zinc-400">Leave blank for no limit</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => moveQuestion(qIndex, -1)} disabled={locked || qIndex === 0}>↑</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveQuestion(qIndex, 1)} disabled={locked || qIndex === questions.length - 1}>↓</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(qIndex)} disabled={locked}>🗑</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {!locked && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addQuestion}>
            + Add Question
          </Button>
          <Button onClick={handleSave} disabled={saving || questions.length === 0}>
            {saving ? "Saving…" : "Save Ballot"}
          </Button>
        </div>
      )}
    </div>
  )
}
