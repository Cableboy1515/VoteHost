export const runtime = "nodejs"

import PDFDocument from "pdfkit"
import { requireRole } from "@/lib/auth"
import { loadExportData, exportFilename } from "@/lib/exportData"

const ACCENT = "#3F66D9"
const ACCENT_SOFT = "#EEF2FC"
const INK = "#1D2338"
const INK_SOFT = "#374060"
const MUTED = "#6B7192"
const LINE = "#E4E6F0"

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (c: Buffer) => chunks.push(c))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", reject)
    doc.end()
  })
}

function drawHLine(doc: PDFKit.PDFDocument, y: number, color = LINE) {
  doc.save().strokeColor(color).lineWidth(0.5).moveTo(50, y).lineTo(545, y).stroke().restore()
}

function drawWinnerBadge(doc: PDFKit.PDFDocument, x: number, y: number) {
  doc
    .save()
    .fontSize(8)
    .fillColor(ACCENT)
    .text("✓ Winner", x, y + 1)
    .restore()
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params
  const data = await loadExportData(id)
  if (!data) return new Response("Not found or election not completed", { status: 404 })

  const { election, totalVoters, votedCount, turnoutPct, questions } = data

  const doc = new PDFDocument({
    size: "LETTER",
    margin: 50,
    info: { Title: `${election.title} — Results`, Creator: "VoteHost" },
  })

  // ─── Header ───────────────────────────────────────────────────────────
  doc.fontSize(22).fillColor(ACCENT).font("Helvetica-Bold").text(election.title, { align: "left" })
  doc.fontSize(13).fillColor(INK_SOFT).font("Helvetica").text("Final Results", { align: "left" })
  doc.moveDown(0.4)

  const closeDate = (election.closedAt ?? election.endsAt ?? election.createdAt)
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  doc.fontSize(10).fillColor(MUTED).text(`Closed ${closeDate}`, { align: "left" })
  doc.moveDown(0.8)

  drawHLine(doc, doc.y)
  doc.moveDown(0.6)

  // ─── Turnout card ─────────────────────────────────────────────────────
  doc
    .fontSize(12)
    .fillColor(INK)
    .font("Helvetica-Bold")
    .text("Voter Turnout", { continued: false })
  doc.moveDown(0.2)
  doc
    .fontSize(11)
    .fillColor(INK_SOFT)
    .font("Helvetica")
    .text(`${votedCount} of ${totalVoters} voters cast a ballot  ·  ${turnoutPct}%`)
  doc.moveDown(1)

  // ─── Per-question results ─────────────────────────────────────────────
  for (const q of questions) {
    if (doc.y > 670) doc.addPage()

    // Question heading
    doc.fontSize(13).fillColor(INK).font("Helvetica-Bold").text(q.questionText)
    doc.moveDown(0.4)

    if (q.type === "WRITE_IN") {
      doc.fontSize(10).fillColor(INK_SOFT).font("Helvetica-Oblique").text("Write-in responses:")
      doc.moveDown(0.2)

      if (q.writeIns.length === 0) {
        doc.fontSize(10).fillColor(MUTED).font("Helvetica").text("(no responses)")
      } else {
        for (const wi of q.writeIns) {
          if (doc.y > 700) doc.addPage()
          doc.fontSize(10).fillColor(INK_SOFT).font("Helvetica").text(`• ${wi ?? ""}`, { indent: 10 })
        }
      }
      doc.moveDown(1)
      continue
    }

    // Table columns: Option (60%), Votes (15%), % (15%), winner (10%)
    const tableLeft = 50
    const colWidths = [295, 75, 75, 50]
    const colX = colWidths.reduce<number[]>((acc, w) => [...acc, (acc.at(-1) ?? tableLeft) + (acc.length > 0 ? colWidths[acc.length - 1] : 0)], [tableLeft])

    // Sub-header
    const subY = doc.y
    doc.save()
    doc.rect(tableLeft, subY, 495, 18).fill(ACCENT_SOFT).restore()
    doc.fontSize(9).fillColor(INK).font("Helvetica-Bold")
    const headers = q.type === "RANKED_CHOICE"
      ? ["Option", "1st choice", "%", ""]
      : ["Option", "Votes", "%", ""]
    headers.forEach((h, i) => {
      doc.text(h, colX[i] + 4, subY + 4, { width: colWidths[i] - 8, align: i === 0 ? "left" : "right" })
    })
    doc.moveDown(0)
    doc.y = subY + 20

    const options = q.type === "RANKED_CHOICE" ? q.options : q.options

    for (const opt of options) {
      if (doc.y > 710) doc.addPage()

      const rowY = doc.y
      const count = q.type === "RANKED_CHOICE"
        ? (opt as typeof q.options[number]).firstChoiceCount
        : (opt as { count: number }).count
      const isWinner = opt.winner

      if (isWinner) {
        doc.save()
        doc.rect(tableLeft, rowY, 495, 18).fill("#F0F4FD").restore()
      }

      doc.fontSize(9).fillColor(isWinner ? ACCENT : INK_SOFT).font(isWinner ? "Helvetica-Bold" : "Helvetica")
      doc.text(opt.optionText, colX[0] + 4, rowY + 4, { width: colWidths[0] - 8 })
      doc.text(String(count), colX[1] + 4, rowY + 4, { width: colWidths[1] - 8, align: "right" })
      doc.text(`${opt.pct}%`, colX[2] + 4, rowY + 4, { width: colWidths[2] - 8, align: "right" })
      if (isWinner) drawWinnerBadge(doc, colX[3] + 4, rowY + 4)

      drawHLine(doc, rowY + 18, "#F0F0F0")
      doc.y = rowY + 20
    }

    doc.moveDown(1.2)
  }

  // ─── Footer ───────────────────────────────────────────────────────────
  const generatedOn = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  })

  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .font("Helvetica")
      .text(
        `Generated by VoteHost · ${generatedOn} · Page ${i + 1} of ${range.count}`,
        50, 740, { align: "center", width: 495 },
      )
  }

  const buffer = await docToBuffer(doc)
  const filename = exportFilename(election, "pdf")

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
