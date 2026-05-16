import { NextResponse } from "next/server"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionBaseSchema, ElectionSchema } from "@/lib/validations"
import { sendElectionCompletedStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"

const UPLOADS_DIR = join(process.cwd(), "public", "uploads")

function unlinkUpload(deleteUrl: string): Promise<void> {
  // Accepts both relative `/api/upload/image/uuid.jpg` and absolute legacy URLs.
  const match = deleteUrl.match(/\/api\/upload\/image\/([^/?#]+)/)
  if (!match) return Promise.resolve()
  const filename = match[1]
  if (filename.includes("/") || filename.includes("..")) return Promise.resolve()
  return unlink(join(UPLOADS_DIR, filename)).catch(() => undefined)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const election = await db.election.findUnique({
    where: { id },
    include: {
      questions: {
        include: { options: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      },
    },
  })
  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(election)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await req.json()
  const parsed = ElectionBaseSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 })

  const before = await db.election.findUnique({
    where: { id },
    select: { startsAt: true, endsAt: true, status: true, completionEmailSentAt: true },
  })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, unknown> = { ...parsed.data }

  // Re-arm closing-soon reminder if endsAt is being moved
  if ("endsAt" in parsed.data) {
    const next = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
    const prev = before.endsAt
    const changed = (next?.getTime() ?? null) !== (prev?.getTime() ?? null)
    if (changed) updates.endsSoonNoticeSentAt = null
  }

  // Re-arm draft-reminder if startsAt is being moved
  if ("startsAt" in parsed.data) {
    const next = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null
    const prev = before.startsAt
    const changed = (next?.getTime() ?? null) !== (prev?.getTime() ?? null)
    if (changed) updates.startReminderSentAt = null
  }

  // Detect manual close transition so we fire the staff completion email inline
  const transitioningToEnd =
    parsed.data.status != null &&
    parsed.data.status === "COMPLETED" &&
    before.status !== "COMPLETED" &&
    before.completionEmailSentAt == null

  if (transitioningToEnd) {
    updates.completionEmailSentAt = new Date()
    updates.closedAt = new Date()
    updates.closedById = session.sub
    updates.reopenedAt = null
    updates.reopenedById = null
  }

  const transitioningFromEnd =
    parsed.data.status != null &&
    parsed.data.status !== "COMPLETED" &&
    before.status === "COMPLETED"

  if (transitioningFromEnd) {
    updates.reopenedAt = new Date()
    updates.reopenedById = session.sub
    updates.closedAt = null
    updates.closedById = null
    updates.completionEmailSentAt = null
  }

  const election = await db.election.update({ where: { id }, data: updates })

  if (transitioningToEnd) {
    const voters = await db.voter.findMany({
      where: { electionId: id },
      select: { hasVoted: true },
    })
    const totalVoters = voters.length
    const votedCount = voters.filter((v) => v.hasVoted).length
    getStaffRecipients()
      .then((recipients) =>
        sendElectionCompletedStaffNotice(
          { id: election.id, title: election.title, endsAt: election.endsAt },
          recipients,
          votedCount,
          totalVoters,
        ),
      )
      .catch((err) => console.error("[PATCH election] completion email threw:", err))
  }

  return NextResponse.json(election)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  // Collect hosted-image delete URLs before cascading delete wipes them
  const election = await db.election.findUnique({
    where: { id },
    select: {
      emailLogoDeleteUrl: true,
      questions: { select: { options: { select: { photoDeleteUrl: true } } } },
    },
  })

  await db.election.delete({ where: { id } })

  if (election) {
    const deleteUrls: string[] = []
    if (election.emailLogoDeleteUrl) deleteUrls.push(election.emailLogoDeleteUrl)
    for (const q of election.questions) {
      for (const o of q.options) {
        if (o.photoDeleteUrl) deleteUrls.push(o.photoDeleteUrl)
      }
    }
    await Promise.allSettled(deleteUrls.map(unlinkUpload))
  }

  return new NextResponse(null, { status: 204 })
}
