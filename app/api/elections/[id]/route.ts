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
import { recordActivity } from "@/lib/recordActivity"
import { electionHasWriteIns } from "@/lib/writeIn"

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
      archived: true,
      firstVoteAt: true,
      completionEmailSentAt: true,
      autoSendResults: true,
      resultsEmailSentAt: true,
      title: true,
      description: true,
      emailSubject: true,
      emailMessage: true,
      emailLogoUrl: true,
      emailLogoDeleteUrl: true,
      emailFooter: true,
      firstReminderDays: true,
      autoActivate: true,
      heroColor: true,
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

  // Whether a close should route to PENDING_REVIEW (write-ins) vs COMPLETED directly.
  // Determined after the transitioningToEnd block runs.
  let enteringReview = false

  if (transitioningToEnd) {
    const now = new Date()
    updates.completionEmailSentAt = now
    updates.closedAt = now
    updates.closedById = session.sub
    updates.endsAt = now.toISOString()
    updates.reopenedAt = null
    updates.reopenedById = null

    // Write-in elections need an admin review pass before the tally is sealed.
    if (await electionHasWriteIns(id)) {
      enteringReview = true
      updates.status = "PENDING_REVIEW"
      // Do NOT seal tallyHash or send results yet — that happens at Finalize.
      // Do NOT set completionEmailSentAt — the cron will send the staff notice
      // after Finalize transitions to COMPLETED.
      delete updates.completionEmailSentAt
    }
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

  // Archive is a post-completion action; unarchive (archived: false) is unrestricted.
  if (parsed.data.archived === true && before.archived !== true && before.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Only completed elections can be archived. Close this election first." },
      { status: 409 },
    )
  }

  // Only flag a key as a lock violation if its submitted value actually differs
  // from what's stored — idempotent re-submissions of unchanged fields are fine.
  function changedKeysOutside(allowed: Set<string>): string[] {
    return Object.keys(parsed.data!).filter((k) => {
      if (allowed.has(k)) return false
      const submitted = (parsed.data as Record<string, unknown>)[k]
      const stored = (before as Record<string, unknown>)[k]
      return (submitted ?? null) !== (stored ?? null)
    })
  }

  // Lock settings once voting has started (mirrors completed-election lock,
  // but allows endsAt extension via the ACTIVE date guards above).
  if (before.firstVoteAt && before.status !== "COMPLETED") {
    const VOTING_STARTED_ALLOWED_KEYS = new Set([
      "endsAt", "status", "archived", "autoSendResults", "heroColor",
    ])
    const lockedKeys = changedKeysOutside(VOTING_STARTED_ALLOWED_KEYS)
    if (lockedKeys.length > 0) {
      return NextResponse.json(
        { error: "Settings are locked — voting has started. To restart with fresh settings, use Discard & Reopen." },
        { status: 423 },
      )
    }
  }

  // Closed elections are immutable — reopening would silently invalidate the
  // published tallyHash without voters knowing. Start a new election instead.
  if (before.status === "COMPLETED" && parsed.data.status != null && parsed.data.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "A completed election cannot be reopened. Its tally is sealed. Create a new election instead." },
      { status: 409 }
    )
  }

  // PENDING_REVIEW elections can only transition to COMPLETED via the /finalize endpoint
  // (which seals the tally hash after admin write-in review). PATCH cannot move them out.
  if (before.status === "PENDING_REVIEW" && parsed.data.status != null && parsed.data.status !== "PENDING_REVIEW") {
    return NextResponse.json(
      { error: "This election is pending write-in review. Use the Finalize button to complete it." },
      { status: 409 }
    )
  }

  // Lock election fields once voting has ended (PENDING_REVIEW or COMPLETED).
  // Only cosmetic/operational fields remain editable.
  if (before.status === "COMPLETED" || before.status === "PENDING_REVIEW") {
    const COMPLETED_ALLOWED_KEYS = new Set(["status", "archived", "autoSendResults", "heroColor"])
    const lockedKeys = changedKeysOutside(COMPLETED_ALLOWED_KEYS)
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

  if (transitioningToEnd && !enteringReview) {
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

  // Determine which activity action this PATCH represented
  if (transitioningToActive) {
    await recordActivity({
      session,
      action: "election.activate",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: election.title,
    })
  } else if (transitioningToEnd && enteringReview) {
    await recordActivity({
      session,
      action: "election.enter_review",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: election.title,
    })
  } else if (transitioningToEnd) {
    await recordActivity({
      session,
      action: "election.close",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: election.title,
    })
  } else if (parsed.data.archived === true && !before.archived) {
    await recordActivity({
      session,
      action: "election.archive",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: election.title,
    })
  } else if (parsed.data.archived === false && before.archived) {
    await recordActivity({
      session,
      action: "election.unarchive",
      electionId: id,
      targetType: "election",
      targetId: id,
      targetLabel: election.title,
    })
  } else {
    const LONG_TEXT = new Set(["description", "emailMessage", "emailFooter"])
    const DATE_KEYS  = new Set(["startsAt", "endsAt"])
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const k of Object.keys(parsed.data)) {
      const fromVal = (before as Record<string, unknown>)[k]
      const toVal   = (parsed.data as Record<string, unknown>)[k]
      if (DATE_KEYS.has(k)) {
        if (!dateMeaningfullyChanged(fromVal as Date | null, toVal as string | null | undefined)) continue
        changes[k] = {
          from: fromVal instanceof Date ? fromVal.toISOString() : null,
          to: toVal ?? null,
        }
      } else if (LONG_TEXT.has(k)) {
        if ((toVal ?? null) === (fromVal ?? null)) continue
        changes[k] = { from: "(updated)", to: "(updated)" }
      } else {
        if ((toVal ?? null) === (fromVal ?? null)) continue
        changes[k] = { from: fromVal ?? null, to: toVal ?? null }
      }
    }
    if (Object.keys(changes).length > 0) {
      await recordActivity({
        session,
        action: "election.update",
        electionId: id,
        targetType: "election",
        targetId: id,
        targetLabel: election.title,
        metadata: { changes },
      })
    }
  }

  return NextResponse.json({ ...election, ...(inviteSummary ?? {}) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Organizers may delete their own Draft elections; only Admins may delete archived elections
  const session = await requireRole("ORGANIZER")
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params

  // Collect hosted-image delete URLs before cascading delete wipes them
  const election = await db.election.findUnique({
    where: { id },
    select: {
      title: true,
      status: true,
      archived: true,
      emailLogoDeleteUrl: true,
      questions: { select: { options: { select: { photoDeleteUrl: true } } } },
    },
  })

  if (!election) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (election.status !== "DRAFT") {
    // Non-draft elections must be archived first
    if (!election.archived) {
      return NextResponse.json(
        { error: "Election must be archived before it can be deleted." },
        { status: 409 },
      )
    }
    // Only admins may delete archived (completed) elections
    if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  await db.election.delete({ where: { id } })

  await recordActivity({
    session,
    action: "election.delete",
    electionId: null,
    targetType: "election",
    targetId: id,
    targetLabel: election.title,
  })

  const deleteUrls: string[] = []
  if (election.emailLogoDeleteUrl) deleteUrls.push(election.emailLogoDeleteUrl)
  for (const q of election.questions) {
    for (const o of q.options) {
      if (o.photoDeleteUrl) deleteUrls.push(o.photoDeleteUrl)
    }
  }
  await Promise.allSettled(deleteUrls.map(unlinkUpload))

  return new NextResponse(null, { status: 204 })
}
