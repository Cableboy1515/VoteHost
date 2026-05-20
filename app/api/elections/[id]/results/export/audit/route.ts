export const runtime = "nodejs"

import { requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { exportFilename } from "@/lib/exportData"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("VIEWER")
  if (!session) return new Response("Forbidden", { status: 403 })

  const { id } = await params

  const election = await db.election.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      tallyHash: true,
      tallyHashSetAt: true,
      closedAt: true,
      endsAt: true,
      createdAt: true,
    },
  })

  if (!election || election.status !== "COMPLETED") {
    return new Response("Not found or election not completed", { status: 404 })
  }

  const [questions, votes, receipts] = await Promise.all([
    db.question.findMany({
      where: { electionId: id },
      include: { options: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    db.vote.findMany({
      where: { electionId: id },
      orderBy: [{ questionId: "asc" }],
    }),
    db.ballotReceipt.findMany({
      where: { electionId: id },
      select: { receiptCode: true, ballotHash: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const payload = {
    electionId: election.id,
    electionTitle: election.title,
    tallyHash: election.tallyHash ? `sha256:${election.tallyHash}` : null,
    tallyHashSetAt: election.tallyHashSetAt?.toISOString() ?? null,
    hashAlgorithm: "SHA-256 of canonical JSON (votes sorted by questionId ASC, optionId ASC, rank ASC)",
    questions: questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options.map((o) => ({ id: o.id, text: o.text, order: o.order })),
    })),
    votes: votes.map((v) => ({
      ballotId: v.ballotId,
      questionId: v.questionId,
      optionId: v.optionId,
      rank: v.rank,
      writeInText: v.writeInText,
    })),
    ballotReceipts: receipts,
  }

  const json = JSON.stringify(payload, null, 2)
  const slug = exportFilename(
    { ...election, closedAt: election.closedAt, endsAt: election.endsAt, createdAt: election.createdAt } as Parameters<typeof exportFilename>[0],
    "json"
  ).replace(".json", "-audit.json")

  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}"`,
    },
  })
}
