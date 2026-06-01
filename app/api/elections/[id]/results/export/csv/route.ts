export const runtime = "nodejs"

import Papa from "papaparse"
import { requireRole } from "@/lib/auth"
import { loadExportData, exportFilename } from "@/lib/exportData"
import { getDisplayTimeZone } from "@/lib/timezone"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params
  const [data, tz] = await Promise.all([loadExportData(id), getDisplayTimeZone()])
  if (!data) return new Response("Not found or election not completed", { status: 404 })

  const { election, questions, tallyHash, quorumType, quorumRequired, quorumMet, votedCount } = data

  type Row = {
    question: string
    option: string
    votes: number | string
    percent: string
    winner: string
  }

  const rows: Row[] = []

  for (const q of questions) {
    if (q.type === "WRITE_IN") {
      for (const wi of q.writeIns) {
        rows.push({
          question: q.questionText,
          option: wi ?? "",
          votes: 1,
          percent: "",
          winner: "",
        })
      }
      if (q.writeIns.length === 0) {
        rows.push({ question: q.questionText, option: "(no responses)", votes: "", percent: "", winner: "" })
      }
    } else if (q.type === "RANKED_CHOICE") {
      for (const opt of q.options) {
        rows.push({
          question: q.questionText,
          option: opt.optionText,
          votes: opt.firstChoiceCount,
          percent: `${opt.pct}`,
          winner: opt.winner ? (q.isTie ? "Tie" : "Yes") : "No",
        })
      }
    } else {
      for (const opt of q.options) {
        rows.push({
          question: q.questionText,
          option: opt.optionText,
          votes: opt.count,
          percent: `${opt.pct}`,
          winner: opt.winner ? (q.isTie ? "Tie" : "Yes") : "No",
        })
      }
    }
  }

  const csvBody = Papa.unparse(rows, {
    columns: ["question", "option", "votes", "percent", "winner"],
    header: true,
  })

  const hasRcv = questions.some((q) => q.type === "RANKED_CHOICE")
  const hashComment = tallyHash ? `# Tally Hash: sha256:${tallyHash}\n` : ""
  const quorumComment = quorumType !== "NONE" && quorumRequired !== null
    ? `# Quorum: ${votedCount} of ${quorumRequired} required — ${quorumMet ? "Met" : "Not met"}\n`
    : ""
  const rcvComment = hasRcv
    ? `# Note: For ranked-choice questions, "votes" = 1st-preference count; winner determined by IRV/STV algorithm.\n`
    : ""
  const csv = hashComment + quorumComment + rcvComment + csvBody

  const filename = exportFilename(election, "csv", tz)

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
