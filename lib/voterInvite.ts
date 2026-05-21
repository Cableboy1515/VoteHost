import { db } from "@/lib/db"
import { sendBallotInvitation } from "@/lib/email"
import { generateVoterToken } from "@/lib/voterToken"

type VoterData = {
  id: string
  name: string
  email: string
  invitedAt: Date | null
  hasVoted: boolean
}

type ElectionData = {
  id: string
  status: string
  title: string
  emailSubject: string | null
  emailMessage: string | null
  emailLogoUrl: string | null
  emailFooter: string | null
  endsAt: Date | null
}

export type InviteOneStatus = "sent" | "voted" | "not_invited" | "election_not_active" | "failed"

export async function sendOneInvite(
  voter: VoterData,
  election: ElectionData,
  baseUrl: string
): Promise<InviteOneStatus> {
  if (voter.hasVoted) return "voted"
  if (!voter.invitedAt) return "not_invited"
  if (election.status !== "ACTIVE") return "election_not_active"

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

  if (error) return "failed"

  await db.voter.update({ where: { id: voter.id }, data: { invitedAt: new Date() } })
  return "sent"
}
