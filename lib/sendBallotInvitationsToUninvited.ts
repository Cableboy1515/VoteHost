import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { generateVoterToken } from "@/lib/voterToken"

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
    select: { id: true, name: true, email: true },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  const now = new Date()
  let sent = 0
  let failed = 0

  for (const voter of uninvitedVoters) {
    try {
      // Generate a fresh token per send; only the hash is stored in the DB.
      const { token, tokenHash } = generateVoterToken()
      await db.voter.update({ where: { id: voter.id }, data: { tokenHash } })

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
      if (error) {
        console.error("[sendBallotInvitationsToUninvited] send failed for", voter.email, error)
        failed++
        continue
      }
      await db.voter.update({ where: { id: voter.id }, data: { invitedAt: now } })
      sent++
    } catch (err) {
      console.error("[sendBallotInvitationsToUninvited] send threw for", voter.email, err)
      failed++
    }
  }

  return { sent, failed }
}
