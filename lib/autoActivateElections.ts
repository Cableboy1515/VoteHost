import { db } from "@/lib/db"
import { canActivate } from "@/lib/canActivate"
import { sendBallotInvitation, sendAutoActivateFailedStaffNotice } from "@/lib/email"
import { getStaffRecipients } from "@/lib/staffRecipients"
import { generateVoterToken, appendVoterToken } from "@/lib/voterToken"

export async function autoActivateElections(): Promise<string[]> {
  const now = new Date()
  const candidates = await db.election.findMany({
    where: {
      status: "DRAFT",
      autoActivate: true,
      startsAt: { not: null, lte: now },
    },
    include: {
      _count: { select: { questions: true, voters: true } },
    },
  })

  if (candidates.length === 0) return []

  const activated: string[] = []
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const staffRecipients = await getStaffRecipients()

  for (const election of candidates) {
    const check = canActivate({
      questionCount: election._count.questions,
      voterCount: election._count.voters,
      endsAt: election.endsAt,
    })

    if (!check.ok) {
      if (election.autoActivateFailedNoticeSentAt == null) {
        try {
          await sendAutoActivateFailedStaffNotice(
            { id: election.id, title: election.title, startsAt: election.startsAt },
            staffRecipients,
            check.reason,
          )
          await db.election.update({
            where: { id: election.id },
            data: { autoActivateFailedNoticeSentAt: now },
          })
        } catch (err) {
          console.error(`[autoActivateElections] failed-notice error for ${election.id}:`, err)
        }
      }
      continue
    }

    try {
      await db.election.update({
        where: { id: election.id },
        data: {
          status: "ACTIVE",
          activatedAt: election.startsAt, // stamp the scheduled time, not now
          activatedById: null,            // null = auto-activated by system
        },
      })

      const uninvitedVoters = await db.voter.findMany({
        where: { electionId: election.id, invitedAt: null },
        select: { id: true, name: true, email: true },
      })

      for (const voter of uninvitedVoters) {
        try {
          const { token, tokenHash } = generateVoterToken()
          await appendVoterToken(voter.id, tokenHash)

          const { error } = await sendBallotInvitation({
            voterName: voter.name,
            voterEmail: voter.email,
            electionTitle: election.title,
            magicLink: `${baseUrl}/vote/${token}`,
            emailSubject: election.emailSubject,
            emailMessage: election.emailMessage,
            emailLogoUrl: election.emailLogoUrl,
            emailFooter: election.emailFooter,
            endsAt: election.endsAt?.toISOString(),
          })
          if (!error) {
            await db.voter.update({ where: { id: voter.id }, data: { invitedAt: now } })
          } else {
            console.error(`[autoActivateElections] invite failed for voter ${voter.id}: ${error}`)
          }
        } catch (err) {
          console.error(`[autoActivateElections] invite threw for voter ${voter.id}:`, err)
        }
      }

      activated.push(election.id)
    } catch (err) {
      console.error(`[autoActivateElections] activation failed for ${election.id}:`, err)
    }
  }

  return activated
}
