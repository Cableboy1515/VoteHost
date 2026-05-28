import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  sendBallotInvitation,
  sendElectionClosingSoonStaffNotice,
  sendElectionCompletedStaffNotice,
  sendDraftReminderStaffNotice,
  sendFullTurnoutStaffNotice,
} from "@/lib/email"
import { recordVoterSendResult } from "@/lib/recordVoterSendResult"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { purgeElectionImages } from "@/lib/imageRetention"
import { autoCompleteElections } from "@/lib/autoCompleteElections"
import { autoActivateElections } from "@/lib/autoActivateElections"
import { generateVoterToken, appendVoterToken } from "@/lib/voterToken"
import { recordActivity } from "@/lib/recordActivity"

// Guards for sweeps that should run at most once per hour despite 1-minute cron frequency.
let lastHeavySweepAt = 0
const HEAVY_SWEEP_INTERVAL_MS = 55 * 60 * 1000 // 55 minutes

const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 })
  }

  const auth = req.headers.get("authorization") ?? ""
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

  // Auto-activate DRAFT elections whose startsAt has arrived — runs every tick.
  await autoActivateElections()

  // Auto-complete expired ACTIVE elections before doing anything else.
  // Newly-completed IDs surface to the staff-completion sweep below.
  await autoCompleteElections()

  const elections = await db.election.findMany({
    where: { status: "ACTIVE", endsAt: { not: null } },
    include: { voters: true },
  })

  let totalSent = 0
  const errors: string[] = []
  const staffRecipients = await getStaffRecipients()

  for (const election of elections) {
    const msUntilEnd = election.endsAt!.getTime() - now.getTime()
    if (msUntilEnd <= 0) continue

    // Closing-soon staff notice (24h before endsAt, fires once per election)
    if (msUntilEnd <= ONE_DAY_MS && election.endsSoonNoticeSentAt == null) {
      const totalVoters = election.voters.length
      const votedCount = election.voters.filter((v) => v.hasVoted).length
      try {
        await sendElectionClosingSoonStaffNotice(
          { id: election.id, title: election.title, endsAt: election.endsAt },
          staffRecipients,
          votedCount,
          totalVoters,
        )
        await db.election.update({
          where: { id: election.id },
          data: { endsSoonNoticeSentAt: now },
        })
        await recordActivity({
          system: true,
          action: "election.closing_soon_notice",
          electionId: election.id,
          targetType: "election",
          targetId: election.id,
          targetLabel: election.title,
        })
      } catch (err) {
        errors.push(`closing-soon ${election.id}: ${String(err)}`)
      }
    }

    const sendingFinal = msUntilEnd <= ONE_DAY_MS
    const sendingEarly =
      !sendingFinal &&
      election.firstReminderDays != null &&
      msUntilEnd <= election.firstReminderDays * ONE_DAY_MS

    if (!sendingFinal && !sendingEarly) continue

    const mode = sendingFinal ? "reminder-final" : "reminder-early"

    const totalVoters = election.voters.length
    const votedCount = election.voters.filter((v) => v.hasVoted).length
    const daysLeft = Math.ceil(msUntilEnd / ONE_DAY_MS)

    const eligible = election.voters.filter(
      (v) =>
        !v.hasVoted &&
        v.invitedAt != null &&
        (sendingFinal ? v.secondReminderSentAt == null : v.firstReminderSentAt == null)
    )

    if (eligible.length === 0) continue

    let electionSent = 0
    let electionFailed = 0

    for (const voter of eligible) {
      const { token, tokenHash } = generateVoterToken()
      await appendVoterToken(voter.id, tokenHash)

      const result = await sendBallotInvitation(
        {
          voterName: voter.name,
          voterEmail: voter.email,
          electionTitle: election.title,
          magicLink: `${baseUrl}/vote/${token}`,
          emailSubject: election.emailSubject,
          emailMessage: election.emailMessage,
          emailLogoUrl: election.emailLogoUrl,
          emailFooter: election.emailFooter,
          endsAt: election.endsAt!.toISOString(),
          daysLeft,
          totalVoters,
          votedCount,
          voterId: voter.id,
          electionId: election.id,
        },
        mode
      )

      await recordVoterSendResult(voter.id, result).catch(() => {})

      if (result.error) {
        errors.push(`${voter.email}: ${result.error}`)
        electionFailed++
        continue
      }

      const updateData = sendingFinal
        ? { secondReminderSentAt: now }
        : { firstReminderSentAt: now }

      await db.voter.update({ where: { id: voter.id }, data: updateData })
      totalSent++
      electionSent++
    }

    await recordActivity({
      system: true,
      action: sendingFinal ? "election.final_reminder_batch" : "election.first_reminder_batch",
      electionId: election.id,
      targetType: "election",
      targetId: election.id,
      targetLabel: election.title,
      metadata: { sent: electionSent, failed: electionFailed, eligibleCount: eligible.length },
    })
  }

  // ── Staff completion sweep (covers auto-complete + any manual close that didn't fire inline) ──
  let completionsSent = 0
  const closedAwaitingNotice = await db.election.findMany({
    where: {
      status: "COMPLETED",
      completionEmailSentAt: null,
    },
    include: { voters: true },
  })
  for (const election of closedAwaitingNotice) {
    const totalVoters = election.voters.length
    const votedCount = election.voters.filter((v) => v.hasVoted).length
    try {
      await sendElectionCompletedStaffNotice(
        { id: election.id, title: election.title, endsAt: election.endsAt },
        staffRecipients,
        votedCount,
        totalVoters,
      )
      await db.election.update({
        where: { id: election.id },
        data: { completionEmailSentAt: now },
      })
      await recordActivity({
        system: true,
        action: "election.completion_notice",
        electionId: election.id,
        targetType: "election",
        targetId: election.id,
        targetLabel: election.title,
      })
      completionsSent++
    } catch (err) {
      errors.push(`completion ${election.id}: ${String(err)}`)
    }
  }

  // ── Draft-reminder sweep (24h before startsAt, status still DRAFT) ──
  let draftRemindersSent = 0
  const draftCutoff = new Date(now.getTime() + ONE_DAY_MS)
  const draftsStartingSoon = await db.election.findMany({
    where: {
      status: "DRAFT",
      startsAt: { not: null, gt: now, lte: draftCutoff },
      startReminderSentAt: null,
    },
    select: { id: true, title: true, startsAt: true },
  })
  for (const election of draftsStartingSoon) {
    try {
      await sendDraftReminderStaffNotice(
        { id: election.id, title: election.title, startsAt: election.startsAt },
        staffRecipients,
      )
      await db.election.update({
        where: { id: election.id },
        data: { startReminderSentAt: now },
      })
      await recordActivity({
        system: true,
        action: "election.starting_soon_notice",
        electionId: election.id,
        targetType: "election",
        targetId: election.id,
        targetLabel: election.title,
      })
      draftRemindersSent++
    } catch (err) {
      errors.push(`draft-reminder ${election.id}: ${String(err)}`)
    }
  }

  // ── Heavy sweeps — run at most once per hour even on 1-minute cron ──
  const runHeavy = now.getTime() - lastHeavySweepAt >= HEAVY_SWEEP_INTERVAL_MS

  // ── Full-turnout sweep (ACTIVE elections where every invited voter has voted) ──
  let fullTurnoutNoticesSent = 0
  if (runHeavy) {
    const turnoutCandidates = await db.election.findMany({
      where: { status: "ACTIVE", fullTurnoutNoticeSentAt: null },
      include: { voters: true },
    })
    for (const election of turnoutCandidates) {
      const invited = election.voters.filter((v) => v.invitedAt != null)
      if (invited.length === 0) continue
      const voted = invited.filter((v) => v.hasVoted)
      if (voted.length !== invited.length) continue
      try {
        await sendFullTurnoutStaffNotice(
          { id: election.id, title: election.title, endsAt: election.endsAt },
          staffRecipients,
          voted.length,
          invited.length,
        )
        await db.election.update({
          where: { id: election.id },
          data: { fullTurnoutNoticeSentAt: now },
        })
        await recordActivity({
          system: true,
          action: "election.full_turnout_notice",
          electionId: election.id,
          targetType: "election",
          targetId: election.id,
          targetLabel: election.title,
        })
        fullTurnoutNoticesSent++
      } catch (err) {
        errors.push(`full-turnout ${election.id}: ${String(err)}`)
      }
    }
  }

  // ── Image retention sweep ────────────────────────────────────────
  let purged = 0
  if (runHeavy) {
    const retentionSetting = await db.setting.findUnique({ where: { key: "image_retention_days" } })
    const retentionDays = retentionSetting?.value ? parseInt(retentionSetting.value, 10) : 30

    if (retentionDays > 0) {
      const cutoff = new Date(now.getTime() - retentionDays * ONE_DAY_MS)
      const stale = await db.election.findMany({
        where: {
          status: "COMPLETED",
          endsAt: { lt: cutoff },
          imagesPurgedAt: null,
        },
        select: { id: true },
      })
      await Promise.allSettled(
        stale.map(async (e) => { await purgeElectionImages(e.id); purged++ })
      )
    }
  }

  if (runHeavy) lastHeavySweepAt = now.getTime()

  return NextResponse.json({
    elections: elections.length,
    sent: totalSent,
    completionsSent,
    draftRemindersSent,
    fullTurnoutNoticesSent,
    purged,
    errors,
  })
}
