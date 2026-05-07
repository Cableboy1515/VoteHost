import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"

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
    include: {
      voters: {
        where: { hasVoted: false, invitedAt: { not: null } },
      },
    },
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

    const eligible = election.voters.filter((v) =>
      sendingFinal ? v.secondReminderSentAt == null : v.firstReminderSentAt == null
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

  return NextResponse.json({ elections: elections.length, sent: totalSent, errors })
}
