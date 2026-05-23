export const runtime = "nodejs"

import ExcelJS from "exceljs"
import { BRAND_NAME } from "@/lib/branding"
import { requireRole } from "@/lib/auth"
import { loadExportData, exportFilename } from "@/lib/exportData"
import { getDisplayTimeZone } from "@/lib/timezone"

const ACCENT = "FF3F66D9"
const ACCENT_SOFT = "FFEEF2FC"
const MUTED_BG = "FFF2F3F9"
const WHITE = "FFFFFFFF"
const INK = "FF1D2338"
const INK_SOFT = "FF374060"
const MUTED = "FF6B7192"

function headerFont(bold = false) {
  return { name: "Calibri", size: 11, bold, color: { argb: INK } }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params
  const [data, tz] = await Promise.all([loadExportData(id), getDisplayTimeZone()])
  if (!data) return new Response("Not found or election not completed", { status: 404 })

  const { election, totalVoters, votedCount, turnoutPct, tallyHash, questions, voters } = data

  const workbook = new ExcelJS.Workbook()
  workbook.creator = BRAND_NAME
  workbook.created = new Date()

  // ─── Sheet 1: Results ────────────────────────────────────────────────
  const ws = workbook.addWorksheet("Results")
  ws.views = [{ state: "frozen", ySplit: 0, xSplit: 0 }]

  // Election metadata rows
  ws.mergeCells("A1:E1")
  const titleCell = ws.getCell("A1")
  titleCell.value = election.title
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: INK } }
  titleCell.alignment = { vertical: "middle" }
  ws.getRow(1).height = 28

  const closeDate = (election.closedAt ?? election.endsAt ?? election.createdAt)
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz })
  ws.getCell("A2").value = `Closed: ${closeDate}`
  ws.getCell("A2").font = { name: "Calibri", size: 11, color: { argb: MUTED } }

  ws.getCell("A3").value = `Turnout: ${votedCount} of ${totalVoters} voters (${turnoutPct}%)`
  ws.getCell("A3").font = { name: "Calibri", size: 11, color: { argb: INK_SOFT } }

  ws.addRow([]) // blank

  for (const q of questions) {
    // Question header row
    const qRow = ws.addRow([q.questionText])
    ws.mergeCells(`A${qRow.number}:E${qRow.number}`)
    const qCell = ws.getCell(`A${qRow.number}`)
    qCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } }
    qCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } }
    qCell.alignment = { vertical: "middle", indent: 1 }
    qRow.height = 22

    if (q.type === "WRITE_IN") {
      const noteRow = ws.addRow(["(See Write-ins sheet for responses)"])
      noteRow.getCell(1).font = { name: "Calibri", size: 10, italic: true, color: { argb: MUTED } }
    } else if (q.type === "RANKED_CHOICE") {
      // Sub-header: Option + one col per rank + Pct
      const rankNums = Array.from({ length: q.maxRank }, (_, i) => `Rank ${i + 1}`)
      const subHeader = ws.addRow(["Option", ...rankNums, "1st-choice %"])
      subHeader.eachCell((cell, col) => {
        if (col <= rankNums.length + 2) {
          cell.font = headerFont(true)
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUTED_BG } }
        }
      })

      for (const opt of q.options) {
        const rankValues = Array.from({ length: q.maxRank }, (_, i) => opt.rankCounts[i + 1] ?? 0)
        const optRow = ws.addRow([opt.optionText, ...rankValues, `${opt.pct}%`])
        if (opt.winner) {
          optRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: INK } }
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_SOFT } }
          })
        }
      }
    } else {
      const subHeader = ws.addRow(["Option", "Votes", "Percent", "Winner"])
      subHeader.eachCell((cell) => {
        cell.font = headerFont(true)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUTED_BG } }
      })

      for (const opt of q.options) {
        const optRow = ws.addRow([opt.optionText, opt.count, `${opt.pct}%`, opt.winner ? "✓" : ""])
        if (opt.winner) {
          optRow.eachCell({ includeEmpty: false }, (cell) => {
            cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: INK } }
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT_SOFT } }
          })
        }
      }
    }

    ws.addRow([]) // spacer
  }

  ws.columns = [
    { width: 40 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
  ]

  // ─── Sheet 2: Write-ins (only if any) ────────────────────────────────
  const writeInQuestions = questions.filter((q) => q.type === "WRITE_IN") as Extract<
    typeof questions[number],
    { type: "WRITE_IN" }
  >[]

  if (writeInQuestions.length > 0) {
    const wsWi = workbook.addWorksheet("Write-ins")
    wsWi.columns = [{ width: 60 }]

    for (const q of writeInQuestions) {
      const qRow = wsWi.addRow([q.questionText])
      qRow.getCell(1).font = { name: "Calibri", size: 12, bold: true, color: { argb: INK } }
      qRow.height = 20

      if (q.writeIns.length === 0) {
        const emptyRow = wsWi.addRow(["(No responses)"])
        emptyRow.getCell(1).font = { name: "Calibri", size: 11, italic: true, color: { argb: MUTED } }
      } else {
        for (const text of q.writeIns) {
          const r = wsWi.addRow([text ?? ""])
          r.getCell(1).alignment = { wrapText: true }
        }
      }
      wsWi.addRow([])
    }
  }

  // ─── Sheet 3: Verification ────────────────────────────────────────────
  if (tallyHash) {
    const wsVer = workbook.addWorksheet("Verification")
    wsVer.columns = [{ width: 24 }, { width: 80 }]

    const h1 = wsVer.addRow(["Tally Hash Algorithm", "SHA-256 of canonical JSON (votes sorted by questionId ASC, optionId ASC, rank ASC)"])
    h1.getCell(1).font = headerFont(true)

    const h2 = wsVer.addRow(["Tally Hash", `sha256:${tallyHash}`])
    h2.getCell(1).font = headerFont(true)
    h2.getCell(2).font = { name: "Courier New", size: 10, color: { argb: INK } }

    wsVer.addRow([])
    const note = wsVer.addRow(["How to verify", "Download the audit export (JSON) and recompute the SHA-256 of the votes array using the same sort order. If the hash matches, the published results are intact."])
    note.getCell(1).font = headerFont(true)
    note.getCell(2).alignment = { wrapText: true }
    wsVer.getRow(4).height = 40
  }

  // ─── Sheet 4: Voter participation ─────────────────────────────────────
  const wsV = workbook.addWorksheet("Voter participation")
  wsV.views = [{ state: "frozen", ySplit: 1 }]

  const headerRow = wsV.addRow(["Name", "Email", "Invited", "Voted", "Voted at"])
  headerRow.eachCell((cell) => {
    cell.font = headerFont(true)
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUTED_BG } }
  })

  for (const v of voters) {
    wsV.addRow([
      v.name,
      v.email,
      v.invitedAt?.toISOString().slice(0, 10) ?? "",
      v.hasVoted ? "Yes" : "No",
      v.votedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "",
    ])
  }

  wsV.columns = [
    { width: 24 },
    { width: 32 },
    { width: 14 },
    { width: 10 },
    { width: 20 },
  ]

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = exportFilename(election, "xlsx")

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
