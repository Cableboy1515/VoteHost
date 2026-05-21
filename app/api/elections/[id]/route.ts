import { NextResponse } from "next/server"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionBaseSchema, ElectionSchema } from "@/lib/validations"
import { sendElectionCompletedStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { canActivate, CANNOT_ACTIVATE_MESSAGES } from "@/lib/canActivate"
import { sendBallotInvitationsToUninvited } from "@/lib/sendBallotInvitationsToUninvited"
import { computeTallyHash } from "@/lib/verification"

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
    select: {
      startsAt: true,
      endsAt: true,
      status: true,
      firstVoteAt: true,
      completionEmailSentAt: true,
      _count: { select: { questions: true, voters: true } },
    },
  })
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Validate DRAFT → ACTIVE transition via the settings form path.
  const transitioningToActive =
    parsed.data.status === "ACTIVE" && before.status === "DRAFT"
  if (transitioningToActive) {
    const endsAt = parsed.data.endsAt !== undefined
      ? (parsed.data.endsAt ? new Date(parsed.data.endsAt) : null)
      : before.endsAt
    const check = canActivate({
      questionCount: before._count.questions,
      voterCount: before._count.voters,
      endsAt,
    })
    if (!check.ok) {
      return NextResponse.json({ error: CANNOT_ACTIVATE_MESSAGES[check.reason] }, { status: 409 })
    }
  }

  const updates: Record<string, unknown> = { ...parsed.data }

  // Re-arm closing-soon reminder if endsAt is being moved
  if ("endsAt" in parsed.data) {
    const next = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
    const prev = before.endsAt
    const changed = (next?.getTime() ?? null) !== (prev?.getTime() ?? null)
    if (changed) updates.endsSoonNoticeSentAt = null
  }

  // Re-arm draft-reminder and auto-activate failed notice if startsAt is being moved
  if ("startsAt" in parsed.data) {
    const next = parsed.data.startsAt ? new Date(parsed.data.startsAt) : null
    const prev = before.startsAt
    const changed = (next?.getTime() ?? null) !== (prev?.getTime() ?? null)
    if (changed) {
      updates.startReminderSentAt = null
      updates.autoActivateFailedNoticeSentAt = null
    }
  }

  // Stamp activation audit fields on DRAFT → ACTIVE via settings form.
  if (transitioningToActive) {
    const now = new Date()
    updates.activatedAt = now
    updates.activatedById = session.sub
    updates.startReminderSentAt = null
    updates.startsAt = now
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

  // Reverting ACTIVE → DRAFT must go through the /cancel-activation endpoint,
  // which enforces firstVoteAt==null and notifies invited voters.
  if (parsed.data.status === "DRAFT" && before.status === "ACTIVE") {
    const message = before.firstVoteAt
      ? "Votes have been cast. Use Discard & Reopen to fix the ballot."
      : "To cancel activation, use the Cancel Activation button on the Settings page."
    return NextResponse.json({ error: message }, { status: 409 })
  }

  // Closed elections are immutable — reopening would silently invalidate the
  // published tallyHash without voters knowing. Start a new election instead.
  if (before.status === "COMPLETED" && parsed.data.status != null && parsed.data.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "A completed election cannot be reopened. Its tally is sealed. Create a new election instead." },
      { status: 409 }
    )
  }

  const election = await db.election.update({ where: { id }, data: updates })

  let inviteSummary: Awaited<ReturnType<typeof sendBallotInvitationsToUninvited>> | undefined
  if (transitioningToActive) {
    inviteSummary = await sendBallotInvitationsToUninvited(id)
  }

  if (transitioningToEnd) {
    const votes = await db.vote.findMany({ where: { electionId: id } })
    const hash = computeTallyHash(votes)
    await db.election.update({
      where: { id },
      data: { tallyHash: hash, tallyHashSetAt: new Date() },
    })

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

  return NextResponse.json({ ...election, ...(inviteSummary ?? {}) })
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
