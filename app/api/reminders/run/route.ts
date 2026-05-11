import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { purgeElectionImages } from "@/lib/imageRetention"

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

  const elections = await db.election.findMany({
    where: { status: "ACTIVE", endsAt: { not: null } },
    include: { voters: true },
  })

  let totalSent = 0
  const errors: string[] = []

  for (const election of elections) {
    const msUntilEnd = election.endsAt!.getTime() - now.getTime()
    if (msUntilEnd <= 0) continue

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

    for (const voter of eligible) {
      const { error } = await sendBallotInvitation(
        {
          voterName: voter.name,
          voterEmail: voter.email,
          electionTitle: election.title,
          magicLink: `${baseUrl}/vote/${voter.token}`,
          emailSubject: election.emailSubject,
          emailMessage: election.emailMessage,
          emailLogoUrl: election.emailLogoUrl,
          emailFooter: election.emailFooter,
          endsAt: election.endsAt!.toISOString(),
          daysLeft,
          totalVoters,
          votedCount,
        },
        mode
      )

      if (error) {
        errors.push(`${voter.email}: ${error}`)
        continue
      }

      const updateData = sendingFinal
        ? { secondReminderSentAt: now }
        : { firstReminderSentAt: now }

      await db.voter.update({ where: { id: voter.id }, data: updateData })
      totalSent++
    }
  }

  // ── Image retention sweep ────────────────────────────────────────
  let purged = 0
  const retentionSetting = await db.setting.findUnique({ where: { key: "image_retention_days" } })
  const retentionDays = retentionSetting?.value ? parseInt(retentionSetting.value, 10) : 30

  if (retentionDays > 0) {
    const cutoff = new Date(now.getTime() - retentionDays * ONE_DAY_MS)
    const stale = await db.election.findMany({
      where: {
        status: { in: ["CLOSED", "COMPLETED"] },
        endsAt: { lt: cutoff },
        imagesPurgedAt: null,
      },
      select: { id: true },
    })
    await Promise.allSettled(
      stale.map(async (e) => { await purgeElectionImages(e.id); purged++ })
    )
  }

  return NextResponse.json({ elections: elections.length, sent: totalSent, purged, errors })
}
