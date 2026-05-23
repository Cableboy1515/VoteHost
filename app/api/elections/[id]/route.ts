import { NextResponse } from "next/server"
import { unlink } from "node:fs/promises"
import { join } from "node:path"
import { getSession, requireRole } from "@/lib/auth"
import { db } from "@/lib/db"
import { ElectionBaseSchema, ElectionSchema } from "@/lib/validations"
import { sendElectionCompletedStaffNotice, sendElectionExtendedNoticeToUnvoted, sendElectionExtendedStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { canActivate, CANNOT_ACTIVATE_MESSAGES } from "@/lib/canActivate"
import { sendBallotInvitationsToUninvited } from "@/lib/sendBallotInvitationsToUninvited"
import { computeTallyHash } from "@/lib/verification"
import { sendElectionResultsEmail } from "@/lib/sendElectionResultsEmail"

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
      autoSendResults: true,
      resultsEmailSentAt: true,
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

  // HTML datetime-local inputs are minute-precision only; sub-minute deltas are not real edits.
  const TOLERANCE_MS = 60_000
  function dateMeaningfullyChanged(prev: Date | null, next: string | null | undefined): boolean {
    const pn = prev ? prev.getTime() : null
    const nn = next ? new Date(next).getTime() : null
    if (pn === null && nn === null) return false
    if (pn === null || nn === null) return true
    return Math.abs(pn - nn) > TOLERANCE_MS
  }
  const startsAtChanged = "startsAt" in parsed.data && dateMeaningfullyChanged(before.startsAt, parsed.data.startsAt)
  const endsAtChanged = "endsAt" in parsed.data && dateMeaningfullyChanged(before.endsAt, parsed.data.endsAt)

  const updates: Record<string, unknown> = { ...parsed.data }

  // Re-arm closing-soon reminder if endsAt is meaningfully moved
  if (endsAtChanged) updates.endsSoonNoticeSentAt = null

  // Re-arm draft-reminder and auto-activate failed notice if startsAt is meaningfully moved
  if (startsAtChanged) {
    updates.startReminderSentAt = null
    updates.autoActivateFailedNoticeSentAt = null
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
    const now = new Date()
    updates.completionEmailSentAt = now
    updates.closedAt = now
    updates.closedById = session.sub
    updates.endsAt = now.toISOString()
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

  // Lock Opens date entirely and Closes date to extension-only while ACTIVE.
  let extending = false
  if (before.status === "ACTIVE" && !transitioningToEnd) {
    if (startsAtChanged) {
      return NextResponse.json(
        { error: "Schedule locked — election is in progress. Opens date cannot be changed." },
        { status: 423 },
      )
    }
    if ("endsAt" in parsed.data && before.endsAt !== null) {
      const newEndsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
      if (newEndsAt === null) {
        return NextResponse.json(
          { error: "Closes date cannot be removed while election is in progress." },
          { status: 423 },
        )
      }
      if (endsAtChanged && newEndsAt.getTime() < before.endsAt.getTime()) {
        return NextResponse.json(
          { error: "Closes date can only be extended to a later time while the election is in progress." },
          { status: 423 },
        )
      }
      if (endsAtChanged && newEndsAt.getTime() > before.endsAt.getTime()) {
        extending = true
      }
    }
    // Preserve original date precision in the DB — only write if meaningfully changed.
    if (!startsAtChanged) delete updates.startsAt
    if (!endsAtChanged) delete updates.endsAt
  }

  // Closed elections are immutable — reopening would silently invalidate the
  // published tallyHash without voters knowing. Start a new election instead.
  if (before.status === "COMPLETED" && parsed.data.status != null && parsed.data.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "A completed election cannot be reopened. Its tally is sealed. Create a new election instead." },
      { status: 409 }
    )
  }

  // Lock the voter-facing historical record once completed. Only cosmetic/operational
  // fields remain editable (archived, autoSendResults, heroColor).
  if (before.status === "COMPLETED") {
    const COMPLETED_ALLOWED_KEYS = new Set(["status", "archived", "autoSendResults", "heroColor"])
    const lockedKeys = Object.keys(parsed.data).filter((k) => !COMPLETED_ALLOWED_KEYS.has(k))
    if (lockedKeys.length > 0) {
      return NextResponse.json(
        { error: "This election is completed — its historical record is locked. To run another vote, create a new election." },
        { status: 423 }
      )
    }
  }

  const election = await db.election.update({ where: { id }, data: updates })

  if (extending && before.endsAt && election.endsAt) {
    const newEndsAt = election.endsAt
    const oldEndsAt = before.endsAt
    sendElectionExtendedNoticeToUnvoted(id, newEndsAt)
      .catch((err) => console.error("[PATCH election] extended voter notice threw:", err))
    getStaffRecipients()
      .then((recipients) =>
        sendElectionExtendedStaffNotice(
          { id: election.id, title: election.title },
          recipients,
          oldEndsAt,
          newEndsAt,
          session.email,
        ),
      )
      .catch((err) => console.error("[PATCH election] extended staff notice threw:", err))
  }

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

    if (before.autoSendResults && !before.resultsEmailSentAt) {
      sendElectionResultsEmail(id).catch((err) =>
        console.error("[PATCH election] auto-send results email threw:", err)
      )
    }
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
