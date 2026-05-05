"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import type { ElectionResults } from "@/lib/results"

interface Props {
  electionId: string
  initialData: ElectionResults
}

export default function ResultsDashboard({ electionId, initialData }: Props) {
  const [data, setData] = useState<ElectionResults>(initialData)

  useEffect(() => {
    const es = new EventSource(`/api/elections/${electionId}/results/stream`)
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data))
      } catch {
        // ignore parse errors
      }
    }
    return () => es.close()
  }, [electionId])

  const participationPct = data.totalVoters > 0 ? (data.votedCount / data.totalVoters) * 100 : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={participationPct} className="flex-1" />
            <span className="text-sm font-medium whitespace-nowrap">
              {data.votedCount} / {data.totalVoters} voted ({Math.round(participationPct)}%)
            </span>
          </div>
        </CardContent>
      </Card>

      {data.questions.map((q) => (
        <Card key={q.questionId}>
          <CardHeader>
            <CardTitle className="text-base">{q.questionText}</CardTitle>
            <p className="text-xs text-zinc-400 uppercase tracking-wide">{q.type.replace("_", " ")}</p>
          </CardHeader>
          <CardContent>
            {q.type === "WRITE_IN" ? (
              <div>
                {"writeIns" in q && q.writeIns.length > 0 ? (
                  <ul className="space-y-1">
                    {(q.writeIns as string[]).map((text, i) => (
                      <li key={i} className="text-sm bg-zinc-50 border rounded px-3 py-1">{text}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-400">No responses yet.</p>
                )}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={"options" in q ? q.options.map((o) => ({
                    name: o.optionText,
                    votes: "count" in o ? o.count : "firstChoiceCount" in o ? o.firstChoiceCount : 0,
                  })) : []}
                  layout="vertical"
                  margin={{ left: 8, right: 24 }}
                >
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="votes" fill="#111" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
