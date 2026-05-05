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
  options: OptionDraft[]
}

interface Props {
  electionId: string
  initialQuestions: QuestionDraft[]
}

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Single choice",
  MULTIPLE_CHOICE: "Multiple choice",
  RANKED_CHOICE: "Ranked choice",
  WRITE_IN: "Write-in",
}

export default function BallotBuilder({ electionId, initialQuestions }: Props) {
  const [questions, setQuestions] = useState<QuestionDraft[]>(initialQuestions)
  const [saving, setSaving] = useState(false)

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
                  />
                  <Select
                    value={q.type}
                    onValueChange={(v) => {
                      if (v === null) return
                      updateQuestion(qIndex, {
                        type: v as QuestionType,
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
                  <Badge variant={q.required ? "default" : "secondary"} className="cursor-pointer select-none" onClick={() => updateQuestion(qIndex, { required: !q.required })}>
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
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeOption(qIndex, oIndex)}
                          disabled={q.options.length <= 2}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => addOption(qIndex)}>
                      + Add option
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => moveQuestion(qIndex, -1)} disabled={qIndex === 0}>↑</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => moveQuestion(qIndex, 1)} disabled={qIndex === questions.length - 1}>↓</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(qIndex)}>🗑</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={addQuestion}>
          + Add Question
        </Button>
        <Button onClick={handleSave} disabled={saving || questions.length === 0}>
          {saving ? "Saving…" : "Save Ballot"}
        </Button>
      </div>
    </div>
  )
}
