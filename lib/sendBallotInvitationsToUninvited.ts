import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"

export async function sendBallotInvitationsToUninvited(
  electionId: string,
): Promise<{ sent: number; failed: number }> {
  const election = await db.election.findUnique({
    where: { id: electionId },
    select: {
      title: true,
      emailSubject: true,
      emailMessage: true,
      emailLogoUrl: true,
      emailFooter: true,
      endsAt: true,
    },
  })
  if (!election) return { sent: 0, failed: 0 }

  const uninvitedVoters = await db.voter.findMany({
    where: { electionId, invitedAt: null },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const now = new Date()
  let sent = 0
  let failed = 0

  for (const voter of uninvitedVoters) {
    try {
      const { error } = await sendBallotInvitation({
        voterName: voter.name,
        voterEmail: voter.email,
        electionTitle: election.title,
        magicLink: `${baseUrl}/vote/${voter.token}`,
        emailSubject: election.emailSubject,
        emailMessage: election.emailMessage,
        emailLogoUrl: election.emailLogoUrl,
        emailFooter: election.emailFooter,
        endsAt: election.endsAt?.toISOString(),
      })
      if (error) { failed++; continue }
      await db.voter.update({ where: { id: voter.id }, data: { invitedAt: now } })
      sent++
    } catch {
      failed++
    }
  }

  return { sent, failed }
}
