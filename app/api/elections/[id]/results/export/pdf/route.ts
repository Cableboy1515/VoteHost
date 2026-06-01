export const runtime = "nodejs"

import PDFDocument from "pdfkit"
import { BRAND_NAME } from "@/lib/branding"
import SVGtoPDF from "svg-to-pdfkit"
import { requireRole } from "@/lib/auth"
import { loadExportData, exportFilename } from "@/lib/exportData"
import type { ExportData } from "@/lib/exportData"
import { getDisplayTimeZone } from "@/lib/timezone"

const ACCENT = "#3F66D9"
const INK = "#1D2338"
const INK_SOFT = "#374060"
const MUTED = "#6B7192"
const LINE = "#E4E6F0"
const WHITE = "#FFFFFF"

const WORDMARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 10 98.03 24" width="196" height="48" role="img" aria-label="${BRAND_NAME}">
  <rect x="0" y="10" width="24" height="24" rx="5.5" ry="5.5" fill="#3F66D9"></rect>
  <path d="M6.5 22.5 L10.8 26.8 L18.5 17.2" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path>
  <path d="M31.368 10.091L33.536 10.091L36.375 18.678L36.487 18.678L39.320 10.091L41.494 10.091L37.648 21L35.208 21L31.368 10.091Z M45.492 21.160L45.492 21.160Q44.293 21.160 43.414 20.632Q42.535 20.105 42.053 19.157Q41.571 18.209 41.571 16.941L41.571 16.941Q41.571 15.673 42.053 14.720Q42.535 13.766 43.414 13.239Q44.293 12.712 45.492 12.712L45.492 12.712Q46.690 12.712 47.569 13.239Q48.448 13.766 48.930 14.720Q49.412 15.673 49.412 16.941L49.412 16.941Q49.412 18.209 48.930 19.157Q48.448 20.105 47.569 20.632Q46.690 21.160 45.492 21.160ZM45.502 19.615L45.502 19.615Q46.152 19.615 46.589 19.256Q47.026 18.896 47.242 18.289Q47.457 17.681 47.457 16.936L47.457 16.936Q47.457 16.185 47.242 15.575Q47.026 14.965 46.589 14.603Q46.152 14.240 45.502 14.240L45.502 14.240Q44.836 14.240 44.397 14.603Q43.958 14.965 43.742 15.575Q43.526 16.185 43.526 16.936L43.526 16.936Q43.526 17.681 43.742 18.289Q43.958 18.896 44.397 19.256Q44.836 19.615 45.502 19.615Z M50.379 12.818L55.083 12.818L55.083 14.310L50.379 14.310L50.379 12.818ZM51.541 18.859L51.541 10.858L53.469 10.858L53.469 18.539Q53.469 18.928 53.589 19.133Q53.709 19.338 53.906 19.413Q54.103 19.487 54.342 19.487L54.342 19.487Q54.523 19.487 54.675 19.461Q54.827 19.434 54.907 19.413L54.907 19.413L55.232 20.920Q55.077 20.973 54.792 21.037Q54.508 21.101 54.097 21.112L54.097 21.112Q53.373 21.133 52.792 20.891Q52.212 20.648 51.873 20.137Q51.535 19.626 51.541 18.859L51.541 18.859Z M60.189 21.160L60.189 21.160Q58.958 21.160 58.066 20.646Q57.174 20.132 56.695 19.186Q56.215 18.241 56.215 16.957L56.215 16.957Q56.215 15.695 56.697 14.738Q57.179 13.782 58.047 13.247Q58.916 12.712 60.088 12.712L60.088 12.712Q60.844 12.712 61.518 12.954Q62.192 13.196 62.711 13.702Q63.230 14.208 63.529 14.989Q63.827 15.769 63.827 16.845L63.827 16.845L63.827 17.436L57.121 17.436L57.121 16.137L61.979 16.137Q61.973 15.583 61.739 15.149Q61.505 14.714 61.086 14.464Q60.668 14.214 60.114 14.214L60.114 14.214Q59.523 14.214 59.076 14.499Q58.628 14.784 58.380 15.244Q58.133 15.705 58.127 16.254L58.127 16.254L58.127 17.388Q58.127 18.102 58.388 18.611Q58.649 19.120 59.118 19.389Q59.587 19.658 60.215 19.658L60.215 19.658Q60.636 19.658 60.977 19.538Q61.318 19.418 61.568 19.184Q61.819 18.949 61.947 18.603L61.947 18.603L63.747 18.805Q63.577 19.519 63.100 20.049Q62.623 20.579 61.883 20.869Q61.142 21.160 60.189 21.160Z M67.473 21L65.497 21L65.497 10.091L67.473 10.091L67.473 14.709L72.529 14.709L72.529 10.091L74.510 10.091L74.510 21L72.529 21L72.529 16.366L67.473 16.366L67.473 21Z M80.095 21.160L80.095 21.160Q78.897 21.160 78.018 20.632Q77.139 20.105 76.657 19.157Q76.175 18.209 76.175 16.941L76.175 16.941Q76.175 15.673 76.657 14.720Q77.139 13.766 78.018 13.239Q78.897 12.712 80.095 12.712L80.095 12.712Q81.294 12.712 82.173 13.239Q83.052 13.766 83.534 14.720Q84.016 15.673 84.016 16.941L84.016 16.941Q84.016 18.209 83.534 19.157Q83.052 20.105 82.173 20.632Q81.294 21.160 80.095 21.160ZM80.106 19.615L80.106 19.615Q80.756 19.615 81.193 19.256Q81.630 18.896 81.845 18.289Q82.061 17.681 82.061 16.936L82.061 16.936Q82.061 16.185 81.845 15.575Q81.630 14.965 81.193 14.603Q80.756 14.240 80.106 14.240L80.106 14.240Q79.440 14.240 79.001 14.603Q78.561 14.965 78.346 15.575Q78.130 16.185 78.130 16.936L78.130 16.936Q78.130 17.681 78.346 18.289Q78.561 18.896 79.001 19.256Q79.440 19.615 80.106 19.615Z M92.068 14.981L92.068 14.981L90.310 15.173Q90.235 14.906 90.051 14.672Q89.868 14.438 89.559 14.294Q89.250 14.150 88.802 14.150L88.802 14.150Q88.200 14.150 87.793 14.411Q87.385 14.672 87.391 15.087L87.391 15.087Q87.385 15.444 87.654 15.668Q87.923 15.892 88.547 16.036L88.547 16.036L89.942 16.334Q91.103 16.584 91.671 17.127Q92.238 17.671 92.243 18.550L92.243 18.550Q92.238 19.322 91.793 19.911Q91.349 20.499 90.560 20.830Q89.772 21.160 88.749 21.160L88.749 21.160Q87.247 21.160 86.331 20.529Q85.415 19.897 85.239 18.768L85.239 18.768L87.119 18.587Q87.247 19.141 87.662 19.423Q88.078 19.706 88.744 19.706L88.744 19.706Q89.431 19.706 89.849 19.423Q90.267 19.141 90.267 18.725L90.267 18.725Q90.267 18.374 89.998 18.145Q89.729 17.916 89.165 17.793L89.165 17.793L87.769 17.500Q86.592 17.255 86.027 16.672Q85.463 16.089 85.468 15.194L85.468 15.194Q85.463 14.438 85.881 13.881Q86.299 13.324 87.047 13.018Q87.796 12.712 88.776 12.712L88.776 12.712Q90.214 12.712 91.042 13.324Q91.871 13.937 92.068 14.981Z M93.173 12.818L97.877 12.818L97.877 14.310L93.173 14.310L93.173 12.818ZM94.335 18.859L94.335 10.858L96.263 10.858L96.263 18.539Q96.263 18.928 96.383 19.133Q96.502 19.338 96.700 19.413Q96.897 19.487 97.136 19.487L97.136 19.487Q97.317 19.487 97.469 19.461Q97.621 19.434 97.701 19.413L97.701 19.413L98.026 20.920Q97.871 20.973 97.586 21.037Q97.301 21.101 96.891 21.112L96.891 21.112Q96.167 21.133 95.586 20.891Q95.006 20.648 94.667 20.137Q94.329 19.626 94.335 18.859L94.335 18.859Z" fill="#1B1F2A"></path>
  <path d="M35.565 33L32.527 33L32.527 28.200L35.537 28.200L35.537 28.823L33.252 28.823L33.252 30.286L35.380 30.286L35.380 30.907L33.252 30.907L33.252 32.377L35.565 32.377L35.565 33Z M42.987 33L40.087 33L40.087 28.200L40.812 28.200L40.812 32.377L42.987 32.377L42.987 33Z M50.429 33L47.392 33L47.392 28.200L50.401 28.200L50.401 28.823L48.116 28.823L48.116 30.286L50.244 30.286L50.244 30.907L48.116 30.907L48.116 32.377L50.429 32.377L50.429 33Z M58.938 29.761L58.938 29.761L58.207 29.761Q58.165 29.527 58.050 29.348Q57.935 29.170 57.769 29.046Q57.603 28.922 57.397 28.859Q57.192 28.795 56.963 28.795L56.963 28.795Q56.548 28.795 56.221 29.004Q55.894 29.212 55.705 29.616Q55.517 30.019 55.517 30.600L55.517 30.600Q55.517 31.186 55.705 31.589Q55.894 31.992 56.222 32.198Q56.550 32.405 56.960 32.405L56.960 32.405Q57.188 32.405 57.393 32.343Q57.598 32.280 57.764 32.159Q57.931 32.037 58.047 31.860Q58.163 31.683 58.207 31.453L58.207 31.453L58.938 31.455Q58.880 31.809 58.712 32.106Q58.545 32.402 58.283 32.617Q58.022 32.831 57.687 32.948Q57.352 33.066 56.956 33.066L56.956 33.066Q56.332 33.066 55.845 32.769Q55.357 32.473 55.077 31.920Q54.797 31.366 54.797 30.600L54.797 30.600Q54.797 29.831 55.078 29.279Q55.360 28.727 55.847 28.431Q56.335 28.134 56.956 28.134L56.956 28.134Q57.338 28.134 57.669 28.243Q58.001 28.352 58.266 28.562Q58.531 28.772 58.704 29.073Q58.878 29.374 58.938 29.761Z M64.645 28.823L63.149 28.823L63.149 28.200L66.864 28.200L66.864 28.823L65.366 28.823L65.366 33L64.645 33L64.645 28.823Z M71.262 28.200L71.987 28.200L71.987 33L71.262 33L71.262 28.200Z M80.791 30.600L80.791 30.600Q80.791 31.369 80.510 31.921Q80.229 32.473 79.740 32.769Q79.251 33.066 78.630 33.066L78.630 33.066Q78.007 33.066 77.518 32.769Q77.029 32.473 76.748 31.920Q76.467 31.366 76.467 30.600L76.467 30.600Q76.467 29.831 76.748 29.279Q77.029 28.727 77.518 28.431Q78.007 28.134 78.630 28.134L78.630 28.134Q79.251 28.134 79.740 28.431Q80.229 28.727 80.510 29.279Q80.791 29.831 80.791 30.600ZM80.074 30.600L80.074 30.600Q80.074 30.014 79.885 29.612Q79.696 29.210 79.370 29.003Q79.043 28.795 78.630 28.795L78.630 28.795Q78.215 28.795 77.889 29.003Q77.564 29.210 77.375 29.612Q77.186 30.014 77.186 30.600L77.186 30.600Q77.186 31.186 77.375 31.588Q77.564 31.990 77.889 32.197Q78.215 32.405 78.630 32.405L78.630 32.405Q79.043 32.405 79.370 32.197Q79.696 31.990 79.885 31.588Q80.074 31.186 80.074 30.600Z M88.428 28.200L89.146 28.200L89.146 33L88.480 33L86.040 29.480L85.996 29.480L85.996 33L85.271 33L85.271 28.200L85.942 28.200L88.384 31.725L88.428 31.725L88.428 28.200Z M97.097 29.461L96.398 29.461Q96.361 29.128 96.089 28.944Q95.817 28.760 95.405 28.760L95.405 28.760Q95.109 28.760 94.894 28.853Q94.678 28.945 94.560 29.106Q94.441 29.266 94.441 29.470L94.441 29.470Q94.441 29.641 94.522 29.766Q94.603 29.890 94.736 29.973Q94.868 30.056 95.020 30.111Q95.173 30.166 95.313 30.202L95.313 30.202L95.782 30.323Q96.012 30.380 96.253 30.476Q96.495 30.572 96.701 30.729Q96.907 30.886 97.035 31.118Q97.162 31.350 97.162 31.673L97.162 31.673Q97.162 32.081 96.953 32.398Q96.743 32.714 96.346 32.897Q95.948 33.080 95.386 33.080L95.386 33.080Q94.847 33.080 94.453 32.909Q94.059 32.737 93.837 32.422Q93.614 32.107 93.591 31.673L93.591 31.673L94.317 31.673Q94.338 31.934 94.487 32.106Q94.636 32.278 94.869 32.361Q95.102 32.445 95.381 32.445L95.381 32.445Q95.688 32.445 95.929 32.347Q96.169 32.250 96.307 32.075Q96.445 31.901 96.445 31.666L96.445 31.666Q96.445 31.453 96.325 31.317Q96.204 31.181 95.999 31.092Q95.794 31.003 95.536 30.935L95.536 30.935L94.969 30.780Q94.392 30.623 94.056 30.319Q93.720 30.014 93.720 29.512L93.720 29.512Q93.720 29.098 93.945 28.788Q94.170 28.479 94.554 28.307Q94.938 28.134 95.421 28.134L95.421 28.134Q95.909 28.134 96.282 28.305Q96.656 28.477 96.872 28.775Q97.087 29.074 97.097 29.461L97.097 29.461Z" fill="#1B1F2A"></path>
</svg>`

type Spacing = {
  questionGap: number
  rowH: number
  qFont: number
  turnoutGap: number
}

const NORMAL: Spacing = {
  questionGap: 1.6,
  rowH: 20,
  qFont: 13,
  turnoutGap: 1,
}

const COMPACT: Spacing = {
  questionGap: 1.0,
  rowH: 17,
  qFont: 12,
  turnoutGap: 0.5,
}

function makeDoc(title: string): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "LETTER",
    margin: 50,
    bufferPages: true,
    info: { Title: `${title} — Results`, Creator: BRAND_NAME },
  })
}

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

function drawWinnerBadge(doc: PDFKit.PDFDocument, x: number, y: number, label = "✓ Winner") {
  doc.save().fontSize(8).fillColor(ACCENT).text(label, x, y + 1).restore()
}

function renderContent(doc: PDFKit.PDFDocument, data: ExportData, s: Spacing, tz: string): void {
  const { election, totalVoters, votedCount, turnoutPct, questions } = data

  const closeDate = (election.closedAt ?? election.endsAt ?? election.createdAt)
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: tz })

  // ─── Header ───────────────────────────────────────────────────────────
  const headerY = doc.y
  const pageRight = 545

  doc.font("Helvetica-Bold").fontSize(22)
  const titleLineH = doc.currentLineHeight(true)
  doc.font("Helvetica").fontSize(13)
  const subtitleLineH = doc.currentLineHeight(true)

  const logoH = titleLineH + subtitleLineH
  const logoW = logoH * (98.03 / 24)
  const logoX = pageRight - logoW
  const textW = logoX - 50 - 12

  doc.save()
  SVGtoPDF(doc, WORDMARK_SVG, logoX, headerY, { width: logoW, height: logoH })
  doc.restore()

  doc.fontSize(22).fillColor(ACCENT).font("Helvetica-Bold")
    .text(election.title, 50, headerY, { width: textW })
  doc.x = 50
  doc.fontSize(13).fillColor(INK_SOFT).font("Helvetica")
    .text("Final Results", { width: textW })
  doc.moveDown(0.4)
  doc.x = 50
  doc.fontSize(10).fillColor(MUTED).text(`Closed ${closeDate}`, { align: "left" })
  doc.moveDown(0.8)

  drawHLine(doc, doc.y)
  doc.moveDown(0.6)

  // ─── Turnout card ─────────────────────────────────────────────────────
  doc.x = 50
  doc.fontSize(12).fillColor(INK).font("Helvetica-Bold").text("Voter Turnout")
  doc.moveDown(0.2)
  doc.x = 50
  doc.fontSize(11).fillColor(INK_SOFT).font("Helvetica")
    .text(`${votedCount} of ${totalVoters} voters cast a ballot  ·  ${turnoutPct}%`)
  doc.moveDown(s.turnoutGap)

  // ─── Per-question results ─────────────────────────────────────────────
  const tintPadV = 6
  const tintPadH = 10
  const subH = 18
  const tableLeft = 50
  const colWidths = [295, 75, 75, 50]
  const colX = colWidths.reduce<number[]>(
    (acc, w) => [...acc, (acc.at(-1) ?? tableLeft) + (acc.length > 0 ? colWidths[acc.length - 1] : 0)],
    [tableLeft]
  )

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi]
    const labeled = `${qi + 1}. ${q.questionText}`

    // Measure tinted header bar height based on potentially-wrapped question text
    doc.font("Helvetica-Bold").fontSize(s.qFont)
    const tintH = doc.heightOfString(labeled, { width: 495 - tintPadH * 2 }) + tintPadV * 2

    // Keep-together: ensure tint + at least sub-header + 2 rows (or a few write-in lines) fit
    const minBelow = q.type === "WRITE_IN" ? 30 : subH + s.rowH * 2
    if (doc.y + tintH + minBelow > 720) doc.addPage()

    // Tinted question header bar
    const tintY = doc.y
    doc.save()
    doc.rect(50, tintY, 495, tintH).fill("#F0F4FD")
    doc.restore()
    doc.fontSize(s.qFont).fillColor(INK).font("Helvetica-Bold")
      .text(labeled, 50 + tintPadH, tintY + tintPadV, { width: 495 - tintPadH * 2 })
    doc.y = tintY + tintH

    if (q.type === "WRITE_IN") {
      doc.moveDown(0.3)
      doc.x = 50
      doc.fontSize(10).fillColor(INK_SOFT).font("Helvetica-Oblique").text("Write-in responses:")
      doc.moveDown(0.2)

      if (q.writeIns.length === 0) {
        doc.x = 50
        doc.fontSize(10).fillColor(MUTED).font("Helvetica").text("(no responses)")
      } else {
        for (const wi of q.writeIns) {
          if (doc.y > 700) doc.addPage()
          doc.x = 50
          doc.fontSize(10).fillColor(INK_SOFT).font("Helvetica").text(`• ${wi ?? ""}`, { indent: 10 })
        }
      }
      doc.moveDown(s.questionGap)
      continue
    }

    // Sub-header row flush against tinted bar — accent blue with white text
    const subY = doc.y
    doc.save()
    doc.rect(tableLeft, subY, 495, subH).fill(ACCENT).restore()
    doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold")
    const headers = q.type === "RANKED_CHOICE"
      ? ["Option", "1st pref.", "%", ""]
      : ["Option", "Votes", "%", ""]
    headers.forEach((h, i) => {
      doc.text(h, colX[i] + 4, subY + 5, { width: colWidths[i] - 8, align: i === 0 ? "left" : "right" })
    })
    doc.y = subY + subH + 2

    const qIsTie = (q as { isTie?: boolean }).isTie ?? false
    for (const opt of q.options) {
      if (doc.y > 710) doc.addPage()

      const rowY = doc.y
      const count = q.type === "RANKED_CHOICE"
        ? (opt as typeof q.options[number]).firstChoiceCount
        : (opt as { count: number }).count
      const isWinner = opt.winner

      if (isWinner) {
        doc.save()
        doc.rect(tableLeft, rowY, 495, s.rowH - 2).fill("#F0F4FD").restore()
      }

      doc.fontSize(9).fillColor(isWinner ? ACCENT : INK_SOFT).font(isWinner ? "Helvetica-Bold" : "Helvetica")
      doc.text(opt.optionText, colX[0] + 4, rowY + 4, { width: colWidths[0] - 8 })
      doc.text(String(count), colX[1] + 4, rowY + 4, { width: colWidths[1] - 8, align: "right" })
      doc.text(`${opt.pct}%`, colX[2] + 4, rowY + 4, { width: colWidths[2] - 8, align: "right" })
      if (isWinner) drawWinnerBadge(doc, colX[3] + 4, rowY + 4, qIsTie ? "Tie" : "✓ Winner")

      drawHLine(doc, rowY + s.rowH - 2, "#F0F0F0")
      doc.y = rowY + s.rowH
    }

    doc.moveDown(s.questionGap)
  }
}

function applyPageDecorations(doc: PDFKit.PDFDocument, generatedOn: string, tallyHash: string | null): void {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i)
    const pageText = `Generated by ${BRAND_NAME} · ${generatedOn} · Page ${i + 1} of ${range.count}`
    const footerY = tallyHash ? 720 : 730
    doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
      pageText, 50, footerY, { align: "center", width: 495, lineBreak: false }
    )
    if (tallyHash) {
      doc.fontSize(7).fillColor(MUTED).font("Courier").text(
        `sha256:${tallyHash}`,
        50, 731, { align: "center", width: 495, lineBreak: false }
      )
    }
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params
  const [data, tz] = await Promise.all([loadExportData(id), getDisplayTimeZone()])
  if (!data) return new Response("Not found or election not completed", { status: 404 })

  const { election, tallyHash } = data
  const generatedOn = new Date().toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: tz,
  })

  // First pass — normal spacing
  const doc1 = makeDoc(election.title)
  renderContent(doc1, data, NORMAL, tz)
  const range1 = doc1.bufferedPageRange()
  const finalY1 = doc1.y

  let chosen: PDFKit.PDFDocument

  // If barely overflowing onto a second page, re-render compact to try to fit on one
  if (range1.count === 2 && finalY1 < 200) {
    const doc2 = makeDoc(election.title)
    renderContent(doc2, data, COMPACT, tz)
    const range2 = doc2.bufferedPageRange()
    chosen = range2.count === 1 ? doc2 : doc1
  } else {
    chosen = doc1
  }

  applyPageDecorations(chosen, generatedOn, tallyHash ?? null)

  const buffer = await docToBuffer(chosen)
  const filename = exportFilename(election, "pdf", tz)

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
